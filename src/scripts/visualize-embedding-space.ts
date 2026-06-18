/**
 * Visualize BGE embedding space for query classification.
 * Embeds seed queries → PCA to 2D → SVG scatter plot.
 *
 * Usage: node src/scripts/visualize-embedding-space.ts
 */

import { writeFile } from 'node:fs/promises';
import { initLogger, CAT, createLogger } from '../lib/server/logger.ts';
import { SEED_QUERIES } from '../lib/chat/suggested-questions.ts';
import { embedAndComputeCentroids, saveCentroids } from './seed-data.ts';

await initLogger();
const log = createLogger(CAT.search);

// Embed all seed queries and compute centroids
log.info(`Embedding ${SEED_QUERIES.length} queries...`);
const { vectors, toolCentroid, ragCentroid } = await embedAndComputeCentroids(log);
if (vectors.length === 0) {
  log.error('No seed queries to embed — SEED_QUERIES is empty');
  process.exit(1);
}
log.info(`Done — ${vectors[0].length} dimensions each`);

// ---------------------------------------------------------------------------
// PCA via power iteration — reduce 1024D → 2D
// ---------------------------------------------------------------------------

/**
 * 2D matrix type alias.
 * Inner arrays represent rows, outer array is the collection of rows.
 * All inner arrays must have the same length.
 */
type Matrix = number[][];

/**
 * Subtract column means from data matrix (mean-centering).
 * Required before PCA so the first principal component captures
 * the direction of maximum variance through the origin.
 * @param data - n×d matrix (n samples, d dimensions)
 * @returns centered n×d matrix where each column sums to ~0
 */
function centerData(data: Matrix): Matrix {
  const n = data.length;
  const dim = data[0].length;
  const mean = new Array(dim).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < dim; j++) mean[j] += data[i][j] / n;
  return data.map((row) => row.map((v, j) => v - mean[j]));
}

/**
 * Compute covariance matrix of mean-centered data.
 * cov[i][j] = Σ_k (data[k][i] × data[k][j]) / (n-1)
 * Diagonal entries are variances, off-diagonal are covariances.
 * @param data - n×d mean-centered matrix
 * @returns d×d symmetric positive semi-definite covariance matrix
 */
function covarianceMatrix(data: Matrix): Matrix {
  const n = data.length;
  const dim = data[0].length;
  const cov = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += data[k][i] * data[k][j];
      cov[i][j] = sum / (n - 1);
      cov[j][i] = cov[i][j];
    }
  }
  return cov;
}

/**
 * Power iteration to find dominant eigenvector/eigenvalue of a matrix.
 * Starts with random vector, repeatedly applies matrix multiplication + normalize.
 * Converges to eigenvector with largest eigenvalue for most random init vectors.
 * @param cov - d×d symmetric matrix (typically a covariance matrix)
 * @param dim - dimension d
 * @param iterations - max iterations (default 100; converges ~50 for well-separated data)
 * @returns dominant eigenvector + its eigenvalue via Rayleigh quotient
 * @throws Near-zero norm causes early exit (singular/near-singular matrix)
 */
function powerIteration(cov: Matrix, dim: number, iterations = 100): { vector: number[]; eigenvalue: number } {
  let vec = Array.from({ length: dim }, () => Math.random() * 2 - 1);
  for (let iter = 0; iter < iterations; iter++) {
    const nextVec = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) nextVec[i] += cov[i][j] * vec[j];
    const norm = Math.sqrt(nextVec.reduce((s, v) => s + v * v, 0));
    if (norm < 1e-15) break;
    vec = nextVec.map((v) => v / norm);
  }
  // Rayleigh quotient: lambda = v^T * Cov * v
  const temp = new Array(dim).fill(0);
  for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) temp[i] += cov[i][j] * vec[j];
  const eigenvalue = temp.reduce((s, v, i) => s + v * vec[i], 0);
  return { vector: vec, eigenvalue };
}

/**
 * Hotelling's deflation: remove component contribution from matrix.
 * After finding eigenvector v with eigenvalue λ, subtract λ·v·vᵀ.
 * Enables finding subdominant eigenvectors from the same matrix.
 * @param cov - d×d matrix to deflate
 * @param vector - eigenvector to remove
 * @param eigenvalue - corresponding eigenvalue
 * @returns deflated d×d matrix (same shape, modified values)
 */
function deflate(cov: Matrix, vector: number[], eigenvalue: number): Matrix {
  const dim = cov.length;
  const result = cov.map((row) => [...row]);
  for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) result[i][j] -= eigenvalue * vector[i] * vector[j];
  return result;
}

/**
 * 3-component PCA result: projected coordinates + eigenvalues
 */
type PcaResult = { projected: number[][]; eigenvalues: number[] };

/**
 * Compute 3 principal components via power iteration + deflation.
 * 1. Center data
 * 2. Compute covariance matrix
 * 3. Power iteration for PC1 → deflation → PC2 → deflation → PC3
 * 4. Project centered data onto all three components
 * @param data - n×d matrix (samples × dimensions)
 * @returns projected coordinates (n×3) and eigenvalues (length 3)
 */
function pca3d(data: Matrix): PcaResult {
  const centered = centerData(data);
  const cov = covarianceMatrix(centered);
  const dim = data[0].length;

  // Top component
  const { vector: v1, eigenvalue: e1 } = powerIteration(cov, dim);

  // Second component after deflation
  const deflated1 = deflate(cov, v1, e1);
  const { vector: v2, eigenvalue: e2 } = powerIteration(deflated1, dim);

  // Third component after further deflation
  const deflated2 = deflate(deflated1, v2, e2);
  const { vector: v3, eigenvalue: e3 } = powerIteration(deflated2, dim);

  // Project centered data onto all three components
  const projected = centered.map((row) => [
    row.reduce((s, v, j) => s + v * v1[j], 0),
    row.reduce((s, v, j) => s + v * v2[j], 0),
    row.reduce((s, v, j) => s + v * v3[j], 0),
  ]);

  return { projected, eigenvalues: [e1, e2, e3] };
}

// Save centroid data to JSON
await saveCentroids({ queries: SEED_QUERIES, vectors, toolCentroid, ragCentroid, metaCentroid: [] }, log);
log.info(`Centroids saved to ./data/centroid.json`);

// ---------------------------------------------------------------------------
// PCA on all vectors + centroids
// ---------------------------------------------------------------------------

const allVecs = [...vectors, toolCentroid, ragCentroid];
const { projected: projected3d, eigenvalues } = pca3d(allVecs);
log.info`PC1 eigenvalue: ${eigenvalues[0].toFixed(4)}`;
log.info`PC2 eigenvalue: ${eigenvalues[1].toFixed(4)}`;
log.info`PC3 eigenvalue: ${eigenvalues[2].toFixed(4)}`;

// 2D slice for SVG (PC1 × PC2)
const projected = projected3d.map(([x, y]) => [x, y]);
const queryProjections = projected.slice(0, vectors.length);
const [toolCenter, ragCenter] = projected.slice(vectors.length);

// 3D projections for HTML
const queryProjections3d = projected3d.slice(0, vectors.length);
const [toolCenter3d, ragCenter3d] = projected3d.slice(vectors.length);

// ---------------------------------------------------------------------------
// SVG generation
// ---------------------------------------------------------------------------

const W = 800;
const H = 600;
const PAD = 60;

// Find bounds
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (const [x, y] of projected) {
  if (x < minX) minX = x;
  if (x > maxX) maxX = x;
  if (y < minY) minY = y;
  if (y > maxY) maxY = y;
}
const rangeX = maxX - minX || 1;
const rangeY = maxY - minY || 1;
const pad = 0.1; // 10% padding
minX -= rangeX * pad;
maxX += rangeX * pad;
minY -= rangeY * pad;
maxY += rangeY * pad;

function x2svg(x: number): number {
  return PAD + ((x - minX) / (maxX - minX)) * (W - 2 * PAD);
}
function y2svg(y: number): number {
  return H - PAD - ((y - minY) / (maxY - minY)) * (H - 2 * PAD);
}

const COLORS = { tool: '#3b82f6', rag: '#22c55e', hybrid: '#f59e0b', meta: '#a855f7' };

/**
 * Build an SVG circle element with optional text label.
 * @param cx - center X in SVG coordinate space
 * @param cy - center Y in SVG coordinate space
 * @param r - radius in SVG units
 * @param fill - fill color (hex, rgb, or named)
 * @param stroke - stroke color (default 'none')
 * @param label - optional text label rendered to the right of the circle
 */
function svgCircle(cx: number, cy: number, r: number, fill: string, stroke = 'none', label = ''): string {
  const elems = [
    `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />`,
  ];
  if (label) {
    elems.push(
      `<text x="${(cx + 8).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11" font-family="monospace" fill="#333">${label}</text>`,
    );
  }
  return elems.join('\n');
}

// Build SVG
const lines: string[] = [];
lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);

// Background
lines.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fafafa" rx="8"/>`);

// Title
lines.push(
  `<text x="${W / 2}" y="30" text-anchor="middle" font-size="16" font-weight="bold" font-family="sans-serif" fill="#111">BGE Embedding Space — Tool vs RAG Queries</text>`,
);

// Axes
lines.push(`<line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#ccc" stroke-width="1"/>`);
lines.push(`<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="#ccc" stroke-width="1"/>`);
lines.push(`<text x="${W - PAD + 5}" y="${H - PAD + 4}" font-size="10" font-family="monospace" fill="#888">PC1</text>`);
lines.push(
  `<text x="${PAD - 5}" y="${PAD - 5}" text-anchor="end" font-size="10" font-family="monospace" fill="#888">PC2</text>`,
);

// Grid lines (light)
const GRID_LINES = 4;
for (let i = 0; i <= GRID_LINES; i++) {
  const t = i / GRID_LINES;
  const vx = minX + t * (maxX - minX);
  const vy = minY + t * (maxY - minY);
  const sx = x2svg(vx);
  const sy = y2svg(vy);
  lines.push(`<line x1="${PAD}" y1="${sy}" x2="${W - PAD}" y2="${sy}" stroke="#eee" stroke-width="1"/>`);
  lines.push(`<line x1="${sx}" y1="${PAD}" x2="${sx}" y2="${H - PAD}" stroke="#eee" stroke-width="1"/>`);
  // Axis labels
  if (i > 0) {
    lines.push(
      `<text x="${sx}" y="${H - PAD + 15}" text-anchor="middle" font-size="9" font-family="monospace" fill="#aaa">${vx.toFixed(2)}</text>`,
    );
    lines.push(
      `<text x="${PAD - 8}" y="${sy + 3}" text-anchor="end" font-size="9" font-family="monospace" fill="#aaa">${vy.toFixed(2)}</text>`,
    );
  }
}

// Draw centroids (large stars)
lines.push(
  `<polygon points="${starPoints(x2svg(toolCenter[0]), y2svg(toolCenter[1]), 8)}" fill="${COLORS.tool}" opacity="0.6"/>`,
);
lines.push(
  `<polygon points="${starPoints(x2svg(ragCenter[0]), y2svg(ragCenter[1]), 8)}" fill="${COLORS.rag}" opacity="0.6"/>`,
);

// Draw query points
for (let i = 0; i < queryProjections.length; i++) {
  const [x, y] = queryProjections[i];
  const q = SEED_QUERIES[i];
  const cx = x2svg(x);
  const cy = y2svg(y);
  lines.push(svgCircle(cx, cy, 5, COLORS[q.class], '#fff', q.text.slice(0, 40)));
}

// Legend
const legendX = W - 140;
const legendY = 50;
lines.push(`<rect x="${legendX - 10}" y="${legendY - 10}" width="140" height="90" fill="white" stroke="#ddd" rx="4"/>`);
lines.push(
  `<text x="${legendX}" y="${legendY + 5}" font-size="11" font-weight="bold" font-family="sans-serif" fill="#333">Legend</text>`,
);
const legendItems: [string, string][] = [
  ['tool', 'Tool SEED_QUERIES'],
  ['rag', 'RAG SEED_QUERIES'],
  ['hybrid', 'Ambiguous'],
];
legendItems.forEach(([cls, label], i) => {
  const ly = legendY + 22 + i * 22;
  lines.push(
    `<circle cx="${legendX + 5}" cy="${ly - 2}" r="4" fill="${COLORS[cls as keyof typeof COLORS]}" stroke="white" stroke-width="1"/>`,
  );
  lines.push(
    `<text x="${legendX + 16}" y="${ly + 2}" font-size="10" font-family="sans-serif" fill="#555">${label}</text>`,
  );
});

// Centroid note
lines.push(
  `<text x="${legendX}" y="${legendY + 90}" font-size="9" font-family="sans-serif" fill="#999">★ centroids</text>`,
);

lines.push('</svg>');

/**
 * Compute 5-point star polygon vertices for centroid markers.
 * Outer vertices on circumscribed circle of radius r.
 * Inner vertices at 40% of r, rotated 36° from outer vertices.
 * @param cx - center X
 * @param cy - center Y
 * @param r - outer radius
 * @returns SVG points attribute string ("x1,y1 x2,y2 ...")
 */
function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    // Outer vertex
    const angleOut = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angleOut)).toFixed(1)},${(cy + r * Math.sin(angleOut)).toFixed(1)}`);
    // Inner vertex
    const angleIn = angleOut + Math.PI / 5;
    const ri = r * 0.4;
    pts.push(`${(cx + ri * Math.cos(angleIn)).toFixed(1)},${(cy + ri * Math.sin(angleIn)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const svg = lines.join('\n');
const outPath = './docs/embedding-space.svg';
await writeFile(outPath, svg, 'utf-8');
log.info`SVG written to ${outPath}`;

// ---------------------------------------------------------------------------
// 3D interactive HTML (Plotly.js via CDN)
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained HTML page with Plotly.js 3D scatter plot.
 * Renders SEED_QUERIES colored by class (tool/rag/hybrid) plus centroid diamonds.
 * Uses Plotly 3.0 from CDN. Responsive layout, full viewport.
 * @param queryData - array of query points with text labels and class
 * @param centroids - array of centroid points with labels
 * @returns complete HTML string (inline JS, no external deps beyond CDN)
 */
function buildPlotlyHtml3d(
  queryData: { text: string; class: string; x: number; y: number; z: number }[],
  centroids: { label: string; x: number; y: number; z: number }[],
): string {
  const classes = ['tool', 'rag', 'hybrid', 'meta'];
  const classNames = ['Tool SEED_QUERIES', 'RAG SEED_QUERIES', 'Ambiguous', 'Meta'];
  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];

  let tracesJs = '';
  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci];
    const filtered = queryData.filter((q) => q.class === cls);
    if (filtered.length === 0) continue;
    tracesJs += `    {
      x: ${JSON.stringify(filtered.map((q) => q.x))},
      y: ${JSON.stringify(filtered.map((q) => q.y))},
      z: ${JSON.stringify(filtered.map((q) => q.z))},
      text: ${JSON.stringify(filtered.map((q) => q.text))},
      mode: 'markers',
      type: 'scatter3d',
      name: '${classNames[ci]}',
      marker: { size: 6, color: '${colors[ci]}', line: { color: '#fff', width: 1 } },
      hoverinfo: 'text',
    },
`;
  }

  const centroidsJs = `    {
      x: ${JSON.stringify(centroids.map((c) => c.x))},
      y: ${JSON.stringify(centroids.map((c) => c.y))},
      z: ${JSON.stringify(centroids.map((c) => c.z))},
      text: ${JSON.stringify(centroids.map((c) => c.label))},
      mode: 'markers',
      type: 'scatter3d',
      name: 'Centroids',
      marker: { size: 14, symbol: 'diamond', color: ['#3b82f6', '#22c55e'], line: { color: '#000', width: 1.5 } },
      hoverinfo: 'text',
    }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BGE Embedding Space — 3D</title>
<script src="https://cdn.plot.ly/plotly-3.0.0.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #fafafa; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }
#plot { width: 100vw; height: 100vh; }
</style>
</head>
<body>
<div id="plot"></div>
<script>
var data = [
${tracesJs}${centroidsJs}
];
var layout = {
  title: { text: 'BGE Embedding Space — Tool vs RAG (3D PCA)', font: { size: 16 } },
  scene: {
    xaxis: { title: 'PC1' },
    yaxis: { title: 'PC2' },
    zaxis: { title: 'PC3' },
  },
  margin: { l: 0, r: 0, b: 0, t: 50 },
  paper_bgcolor: '#fafafa',
  plot_bgcolor: '#fafafa',
  legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(255,255,255,0.8)', bordercolor: '#ddd', borderwidth: 1 },
};
Plotly.newPlot('plot', data, layout, { responsive: true });
</script>
</body>
</html>`;
}

const queryPoints = SEED_QUERIES.map((q, i) => ({
  text: q.text,
  class: q.class,
  x: queryProjections3d[i][0],
  y: queryProjections3d[i][1],
  z: queryProjections3d[i][2],
}));

const centData = [
  { label: 'Tool centroid', x: toolCenter3d[0], y: toolCenter3d[1], z: toolCenter3d[2] },
  { label: 'RAG centroid', x: ragCenter3d[0], y: ragCenter3d[1], z: ragCenter3d[2] },
];

const html = buildPlotlyHtml3d(queryPoints, centData);
const htmlPath = './docs/embedding-space-3d.html';
await writeFile(htmlPath, html, 'utf-8');
log.info`3D HTML written to ${htmlPath}`;

// Also print cosine similarities for inspection
log.info`\nCosine similarities to centroids:`;
for (let i = 0; i < SEED_QUERIES.length; i++) {
  const q = SEED_QUERIES[i];
  // cosine sim to centroids using full vectors
  const dotT = vectors[i].reduce((s, v, j) => s + v * toolCentroid[j], 0);
  const magT =
    Math.sqrt(vectors[i].reduce((s, v) => s + v * v, 0)) * Math.sqrt(toolCentroid.reduce((s, v) => s + v * v, 0));
  const simT = magT > 0 ? dotT / magT : 0;
  const dotR = vectors[i].reduce((s, v, j) => s + v * ragCentroid[j], 0);
  const magR =
    Math.sqrt(vectors[i].reduce((s, v) => s + v * v, 0)) * Math.sqrt(ragCentroid.reduce((s, v) => s + v * v, 0));
  const simR = magR > 0 ? dotR / magR : 0;
  log.info`  ${q.class.padEnd(7)} sim(tool)=${simT.toFixed(4)} sim(rag)=${simR.toFixed(4)} gap=${(simT - simR).toFixed(4)}  "${q.text.slice(0, 50)}"`;
}
