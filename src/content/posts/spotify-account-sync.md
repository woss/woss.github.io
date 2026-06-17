---
published: true
title: 'Spotify Account sync to SurrealDB with n8n'
featured: true
description: 'How i built a workflow to sync my Spotify account to SurrealDB using n8n, and how you can do it too.'
date: 2026-05-06
tags:
  - Spotify
  - Data ownership
  - TypeScript
  - SurrealDB
  - n8n
  - Automation
header_image: '[Space whale](https://u.macula.link/_tYCpNQaQE6LlhF_6LDD6w-7)'
workflow_files:
  - label: "Spotify Sync Workflow"
    file: "spotify-workflow.json"
    placeholders:
      - key: surrealdb-cred-id
        label: "SurrealDB Credential ID"
        hint: "Found in n8n URL: /credential/surrealdb-cred-id"
      - key: spotify-cred-id
        label: "Spotify Credential ID"
        hint: "Found in n8n URL: /credential/spotify-cred-id"
---

Spotify has long felt like a necessary evil for musicians and fans, offering [reach at the cost of dignity](https://www.midiaresearch.com/blog/some-artists-are-leaving-spotify-again-heres-whats-different-now), and meager payouts while burying independent artists under algorithmic noise. This year, watching the AI-generated music flooding the platform, Spotify did little to protect original musicians, pushing them further to the margins. And the recent Daniel Ek's investment in surveillance and combat AI tech might have been the last straw, leading to [quite a few artists walking away](https://www.rollingstone.com/music/music-features/artists-left-spotify-ceo-daniel-ek-military-tech-1235425098/) - and many users followed.

> “If it's available on something that doesn't reflect who I am, then it doesn't have a place there.” Fenn Wilson

Now Spotify doesn't just flatten the music and artists' value, it erases what makes music personal.

But with all that, as someone who has 116 playlists with over 25000 songs saved and organized over 15 years of using the platform, 'walking away' didn't sound all that easy… After all, Spotify did a great job of tying us to our own music preferences and history.

But enough is enough. Over the last weekend, I built a workflow tool to reclaim my music collections and playlists from Spotify. It took some time, but was definitely worth it. I am not sure what is the replacement for Spotify, but now at least I have my data synced, ready for the next platform.

Here's how you can do it too — just follow these steps.

# Prep work

I decided to use n8n for automation and SurrealDB as a storage layer. This tutorial doesn't require any programming knowledge, everything is done for you. What is required are few cloud services and few API keys.

## Step One: self-hosted n8n only

To start with self-hosted n8n, go to the n8n main repo and read how to set it up.

[https://github.com/n8n-io/n8n/](https://github.com/n8n-io/n8n/)

Unfortunately the n8n cloud hosted users cannot use this workflow because the Custom node is not verified thus not available to install. If you are interested in this workflow I can create a different one with the officially supported node, please let me know which one would you like to have.

## Step Two: SurrealDB package installed in n8n

**Installation Steps**

1. Open your n8n instance
2. Go to **Settings** > **Community Nodes**
3. Click **Install**
4. Enter [`n8n-nodes-surrealdb`](https://github.com/nsxdavid/n8n-nodes-surrealdb) and click **Install**
5. Restart your n8n instance if prompted

## Step Three: SurrealDB instance, cloud or self hosted

Follow the installation documentation on the official website for self hosted version.

[Running SurrealDB with Docker](https://surrealdb.com/docs/surrealdb/installation/running/docker)

You can configure it as you wish; the best way is to create a user with the password for a database. In our example database is called `spotify`.

If you don't have the SurrealDB Cloud account you can register for free using [this link](https://app.surrealdb.com/referral?code=lg2fb6brc5qjmjvp).

Create namespace:

![Cloud based instance. Create namespace](https://u.macula.link/CoGOi0c6QqW29Jm5amt22Q-7?preset=sys_md)

Cloud based instance. Create namespace

![Create new Database](https://u.macula.link/bzb11TC_TEyofu1UXSSHzA-7?preset=sys_md)

Create new Database

Next step is to set up Database authentication

![Database auth - new system user](https://u.macula.link/BJL4y-95TLCdXlwHJ54naQ-7?preset=sys_md)

Select `New system user`

![SurrealDB - select new system user](https://u.macula.link/d_nOhDQlRpery5wIM9xqew-7?preset=sys_md)

Create user and password

![SurrealDB - create user credentials](https://u.macula.link/s7owKIM7QyOX8Dr4sTZSQQ-7?preset=sys_md)

## Step Four: Connect SurrealDB and n8n

Now, go to your n8n and create a credential. Search for SurrealDB

![n8n credential - search SurrealDB](https://u.macula.link/PddO7ktaTK6emjANv7N3pg-7?preset=sys_md)

And click continue.

Fill in the details and save. The `Connection String` you can find when you click on SurrealDB dashboard and select `Instance actions`. From there you can `Copy hostname`. This should be Saved and tested.

![n8n - SurrealDB connection details form](https://u.macula.link/ati9JcaUTcaEJ6c3NvYtCg-7?preset=sys_md)

## Step Five: Spotify API key and n8n credentials

When you click on `Create credential` in your n8n instance, search for `Spotify` , you will see `Spotify OAuth2 API` select it and follow the documentation link how to retrieve the Token. Once you are done and the credential is saved and tested you can proceed.

<aside>
⚠️

DO NOT execute your workflow just yet.

</aside>

<aside>
✅

Boom. You've laid the groundwork for your Spotify independence — and stuck it to the algorithm.

</aside>

# Workflow creation

Every credential will have a different n8n internal ID. The workflow JSON below includes placeholder values — replace them with your actual credential IDs, then copy the final JSON and import it into n8n.

> The workflow JSON is embedded below. Replace the credential IDs, then copy and import into n8n.

---

<aside>
✅

Now you can create New Workflow and paste the modified JSON.

</aside>

# Workflow explanation

At the end of the file you can find the screenshots to see the workflow before you create it.

The workflow consists of four major parts:

- Sync following artists
- Sync playlists
- Sync liked tracks
- Sync playlist tracks

The last one, `Sync playlist tracks` is the biggest one and most complex. This sub flow fetches all the playlists I have and all the tracks in these playlists, then processes them — creating different relations, creating track records and extracting, creating albums and creating relations to tracks. At the end of the sync you will have a graph of your library. As we decided to use the SurrealDB, we are creating relations as the [Graph Edges](https://surrealdb.com/docs/surrealdb/models/graph#creating-edges-relationships) like `likes_track` or `playlist_track` .

We also implemented DB checks, where needed, to minimize calls to Spotify API because we don't want to trigger `Too many requests` error. We've accomplished this by combining the custom http n8n nodes and native Spotify integration.

![Database design image with relations and table names.](https://u.macula.link/gH6WZ7Y4SruO2InnawnZNg-7?preset=sys_md)

Database design image with relations and table names.

In my case, a library building spanning a decade, with over twenty thousand tracks, I needed the simplicity and robustness when it comes to the inserting and updating the data. It's a good thing that SurrealDB has amazing functionality called `UPSERT` that is really fast, the way it works is to define a unique index and start using it — new records get created, existing ones get updated. This simplifies the workflow a lot, because I don't have to make extra calls and implement logic for the new vs existing record.

Important thing to notice is that due to some, for the lack of better word, weirdness in n8n and SurrealDB node package I had to implement many hacks like `restructuring the payload` or checks that relations exist, etc …

## Quirks and weirdness

Example of the n8n weirdness:

If you look at the `Sync following artists` you will notice a Code Node called `add artistsId`, for some reason once the `Upsert artists` is executed, the Spotify Node output is changed and the id was missing. The SurrealDB node returns the id as an object where the id coming from Spotify is a string. For that reason, adding a new field that doesn't exist in either of the nodes fixes the issue. I'd say this is the most common hack I had to do, it's all over the workflow.

Example of the SurrealDB n8n package:

If you define a field as a `datetime` in the SurrealDB schema, there is no way to add it as a value to the relation, it will default to string and this will raise the error. The only way is to use Query Node, which has its own quirks and weirdness.

For example; If you use Query Node in SurrealDB and set the Retry Count to `0` it will not be picked up and it will always default to `4` which is inside the code, this alone can make the sync a lot longer, especially when creating thousands of relations. It means that if the relation exists it will try to do 4 times to save it, and it will always fail. In our Node we can always state that the Error is not a Workflow stopping, rather a notification. I plan to submit the PR to fix issues I mentioned.

Spotify API responses:

There is one playlist in my library that gets synced all the time, it's called [`must know`](https://open.spotify.com/playlist/4DbKOVVmWllXWpCmGLWCjR?si=26854f33abd04e77), it says in the Spotify app that contains 133 songs, but the API returns 134, and the sync always runs for that playlist. I went on debugging it and noticed that I have left myself clues if something obvious cannot be processed like “mandatory” track key in the list of items from the API response. It turns out that they allow for the `track` to be `null`, no ID no nothing just an empty reference.

![Spotify API - null track field in response](https://u.macula.link/PsdqFcn-SkOy8bAMpdKIUw-7?preset=sys_md)

If you see this pattern now you know that is not the bug in the workflow, rather the inconsistency in the Spotify API.

# Extra goodies

## Live queries

Did you know you can have live queries in SurrealDB? Yep, here are the 4 examples:

```sql
live select id from album;
live select id from playlist;
live select id from track;
live select id from playlist_track;
```

Make sure once you execute this you switch to `Live` mode.

![SurrealDB - live query results](https://u.macula.link/kG9IXqbzTWeVoPaYpnnQOQ-7?preset=sys_md)

Metrics are only available in the cloud, not in the Surrealist desktop

![SurrealDB cloud - metrics dashboard](https://u.macula.link/_tYCpNQaQE6LlhF_6LDD6w-7?preset=sys_md)

- Workflow screenshots

  ![Workflow - sync following artists](https://u.macula.link/FzgR7B1FTpeNVcKb5XPKQg-7?preset=sys_md)

  ![Workflow - sync playlists](https://u.macula.link/ZdH1oCxvTaiuE3d5zgeGtQ-7?preset=sys_md)

  ![Workflow - sync liked tracks](https://u.macula.link/dA_L7GA7Rt6pXYOKm9q76A-7?preset=sys_md)

  ![Workflow - sync playlist tracks](https://u.macula.link/1uR7-lVYSNSiqk7gokPeEA-7?preset=sys_md)

  ![Workflow - full diagram](https://u.macula.link/JYYFiP0KQpiLtgf_XqEGgw-7?preset=sys_md)

## My Stats

Here's the thing about carrying 15 years of music history: it fits in 93MB. Just metadata, no audio files — passports for every track, not the bags themselves.

![Library stats - storage usage](https://u.macula.link/P_78hjb5Tj-qlcLLO6w4Ag-7?preset=sys_md)

From this table you can see that I have 23526 tracks synced, across the playlists and `My library` which we call `Likes`. I have 116 playlists and 16102 albums that are extracted from the songs(tracks). Whats yours?

| Type        | Count |
| ----------- | ----- |
| tracks      | 23526 |
| albums      | 16102 |
| playlists   | 116   |
| liked songs | 1517  |

Drop a comment or tag me — what's the next integration you want me to build?
