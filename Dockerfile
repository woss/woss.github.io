FROM alpine:3.5

ADD static /app/static
ADD app /app/app

WORKDIR /app

CMD ["/app/app"]
EXPOSE 3000

# GOOS=linux GOARCH=amd64 go build -o app  app.go
# docker build --no-cache --rm -t woss/woss-io:0.0.1 . ; docker run -it woss/woss-io:0.0.1

