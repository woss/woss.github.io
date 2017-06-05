# TODO

* error handling
* 404 error
* build whole system in go means cloudbuild should make the app 

# console deployment


`kubectl run woss-io --image=gcr.io/signals-prod/woss-io --port=80`
`kubectl expose deployment woss-io --target-port=80  --type=NodePort`
`kubectl apply -f woss.io.yaml`
`gcloud compute addresses create kubes-cluster-1 --global`
`gcloud container clusters get-credentials cluster-1 --zone europe-west1-b --project signals-prod`