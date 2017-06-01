# TODO

* error handling
* 404 error
* build whole system in go means cloudbuild should make the app 

# console deployment


`kubectl run woss-io --image=gcr.io/woss-private/woss-io --port=80`
`kubectl expose deployment woss-io --target-port=80  --type=NodePort`
`kubectl apply -f woss.io.yaml`


For getting the gcr private repos
```
kubectl create secret docker-registry gcr-json-key \
    --docker-server=https://gcr.io \
    --docker-username=_json_key \
    --docker-password="$(cat ~/Downloads/gcr-pvtkey.json)" \
    --docker-email=woss@woss.io

kubectl patch serviceaccount default \
    -p '{"imagePullSecrets": [{"name": "gcr-json-key"}]}'

```