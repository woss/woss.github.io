# Spotify Account sync to SurrealDB

Status: Ready to write
Created by: daniel
Author: daniel

# Intro

Spotify has long felt like a necessary evil for musicians and fans, offering [reach at the cost of dignity](https://www.midiaresearch.com/blog/some-artists-are-leaving-spotify-again-heres-whats-different-now), and meager payouts while burying independent artists under algorithmic noise. This year, watching the AI-generated music flooding the platform, Spotify did little to protect original

musicians, pushing them further to the margins. And the recent Daniel Ek’s investment in surveillance and combat AI tech might have been the last straw, leading to [quite a few artists walking away](https://www.rollingstone.com/music/music-features/artists-left-spotify-ceo-daniel-ek-military-tech-1235425098/) - and many users followed.

> “If it’s available on something that doesn’t reflect who I am, then it doesn’t have a place there.” Fenn Wilson
> 

Now Spotify doesn’t just flatten the music and artists’ value, it erases what makes music personal.

But with all that, as someone who has 116 playlists with over 25000 songs saved and organized over 15 years of using the platform, ‘walking away’ didn't sound all that easy… After all, Spotify did a great job of tying us to our own music preferences and history.

But enough is enough. Over the last weekend, I  built a workflow tool to reclaim my music collections and playlists from Spotify. It took some time, but was definitely worth it. I am not sure what is the replacement for Spotify, but now at least i have my data synced, ready for the next platform. 

Here’s how you can do it too — just follow these steps.

# Prep work

I decided to use N8N for automation and SurrealDB as a storage layer. This tutorial doesn’t require any programming knowledge, everything is done for you. What is required are few cloud services and few API keys. 

## Step One: self-hosted n8n only

To start with self-hosted n8n, go to the n8n main repo and read how to set it up.

[https://github.com/n8n-io/n8n/](https://github.com/n8n-io/n8n/)

Unfortunately the n8n cloud hosted users cannot use this workflow because the Custom node is not verified thus not available to install. If you are interested in this workflow i can create a different one with the officially supported node, please let me know which one would you like to have.  

## Step Two: SurrealDB package installed in n8n

**Installation Steps**

1. Open your n8n instance
2. Go to **Settings** > **Community Nodes**
3. Click **Install**
4. Enter [`n8n-nodes-surrealdb`](https://github.com/nsxdavid/n8n-nodes-surrealdb) and click **Install**
5. Restart your n8n instance if prompted

## Step Three: SurrealDB instance, cloud or self hosted

Follow the installation documentation on the official website for self hosted version. 

[Running SurrealDB with Docker](https://surrealdb.com/docs/surrealdb/installation/running/docker)

You can configure it as you with, the best way is to create a user with the password for a database. In our example database is called `spotify`.

If you don’t have the SurrealDB Cloud account you can register for free using [this link](https://app.surrealdb.com/referral?code=lg2fb6brc5qjmjvp). 

Create namespace:

![Cloud based instance. Create namespace](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image.png)

Cloud based instance. Create namespace

![Create new Database](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%201.png)

Create new Database

Next step is to set up Database authentication 

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%202.png)

Select `New system user`

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%203.png)

Create user and password

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%204.png)

## Step Four: Connect SurrealDB and n8n

Now, go to your n8n and create a credential. Search for SurrealDB

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%205.png)

And click continue.

Fill in the details and save. The `Connection String` you can find when you click on SurrealDB dashboard and select `Instance actions`.  From there you can `Copy hostname`. This should be Saved and tested.

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%206.png)

## Step Five: Spotify API key and n8n credentials

When you click on `Create credential` in your n8n instance, search for `Spotify` , you will see `Spotify Oayth2 API` select it and follow the documentation link how to retrieve the Token. Once you are done and the credential is saved and tested you can proceed.

<aside>
⚠️

DO NOT execute your workflow just yet.

</aside>

<aside>
✅

Congratulations, you have done base work for your Spotify independence.

</aside>

# Workflow creation

Every credential will have a different n8n internal ID, you can do either of the following:

- to change manually each node in the flow to use correct credential
- or copy the json to text editor of your choice and replace placeholders with the correct values.

- N8N workflow json, expand this then copy this and paste it into text editor
    
    ```json
    {
      "nodes": [
        {
          "parameters": {
            "rule": {
              "interval": [
                {
                  "field": "hours",
                  "hoursInterval": 6,
                  "triggerAtMinute": 31
                }
              ]
            }
          },
          "type": "n8n-nodes-base.scheduleTrigger",
          "typeVersion": 1.2,
          "position": [
            -1472,
            1184
          ],
          "id": "634b5228-5b1a-4871-a8ac-f919327bfaf3",
          "name": "Schedule Trigger"
        },
        {
          "parameters": {
            "mode": "runOnceForEachItem",
            "jsCode": "const { track, track_id} = $input.item.json\nreturn { track, track_id}"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            3248,
            1968
          ],
          "id": "9155754e-6f79-4209-9441-591bc87866e4",
          "name": "clean payload"
        },
        {
          "parameters": {
            "url": "=https://api.spotify.com/v1/users/{{ $json.id.id }}/playlists",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "spotifyOAuth2Api",
            "sendQuery": true,
            "queryParameters": {
              "parameters": [
                {
                  "name": "fields",
                  "value": "next,items(id,snapshot_id,tracks.total)"
                },
                {
                  "name": "limit",
                  "value": "50"
                }
              ]
            },
            "options": {
              "response": {
                "response": {
                  "responseFormat": "json"
                }
              },
              "pagination": {
                "pagination": {
                  "paginationMode": "responseContainsNextURL",
                  "nextURL": "={{ $response.body.next }}",
                  "paginationCompleteWhen": "other",
                  "completeExpression": "={{$response.body.next === null}}"
                }
              }
            }
          },
          "type": "n8n-nodes-base.httpRequest",
          "typeVersion": 4.2,
          "position": [
            64,
            1840
          ],
          "id": "52db77f5-eb95-4ba0-b4d2-4d38434787ce",
          "name": "my playlists",
          "alwaysOutputData": false,
          "credentials": {
            "spotifyOAuth2Api": {
              "id": "spotify-cred-id",
              "name": "Spotify account"
            }
          }
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=select id, snapshot_id from playlist:{{ $json.id }};",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            624,
            1872
          ],
          "id": "f2976ec0-37e8-45dc-9b95-a9025802c9d7",
          "name": "synced playlists",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "mode": "combine",
            "fieldsToMatchString": "snapshot_id",
            "joinMode": "keepNonMatches",
            "outputDataFrom": "input1",
            "options": {}
          },
          "type": "n8n-nodes-base.merge",
          "typeVersion": 3.2,
          "position": [
            816,
            1632
          ],
          "id": "44ea9012-7930-4523-8cc5-1caa4e9e6968",
          "name": "missing playlists",
          "alwaysOutputData": false
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=select id, snapshot_id from playlist:{{ $json.id }} where snapshot_id != \"{{ $json.snapshot_id }}\";",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            976,
            1952
          ],
          "id": "bb40bbd3-bce1-427a-be88-ab80b74e7fb0",
          "name": "query playlist with last snapshot",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "jsCode": "const isObjectEmpty = (objectName) => {\n  return Object.keys(objectName).length === 0\n}\nlet changedPlaylist = []\nfor (const item of $input.all()) {\n  if(!isObjectEmpty(item.json)){\n    changedPlaylist.push({\n      id:item.json.id.id,\n      snapshot_id: item.json.snapshot_id\n    })\n  }\n}\n\n\nreturn changedPlaylist;"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            1312,
            2096
          ],
          "id": "181f4f5c-142a-41e4-a54f-d28929dbefd8",
          "name": "playlists that need sync",
          "alwaysOutputData": false
        },
        {
          "parameters": {
            "url": "=https://api.spotify.com/v1/me",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "spotifyOAuth2Api",
            "options": {}
          },
          "type": "n8n-nodes-base.httpRequest",
          "typeVersion": 4.2,
          "position": [
            -1008,
            1184
          ],
          "id": "b82fcdef-63c8-4865-b018-297224e7390f",
          "name": "get me",
          "credentials": {
            "spotifyOAuth2Api": {
              "id": "spotify-cred-id",
              "name": "Spotify account"
            }
          }
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "user",
            "id": "={{ $json.id }}",
            "data": "={{ $json }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            -784,
            1184
          ],
          "id": "8945a030-4c39-4957-aeb0-59cb2fcbedf3",
          "name": "upsert me",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "fieldToSplitOut": "items",
            "options": {}
          },
          "type": "n8n-nodes-base.splitOut",
          "typeVersion": 1,
          "position": [
            256,
            2080
          ],
          "id": "cef37ccb-5f76-4850-8621-4a86f7f0cfb3",
          "name": "combine all calls"
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=select count() from playlist_track where in = playlist:{{ $json.id }} group all;",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            624,
            2080
          ],
          "id": "18bf2cee-b7c3-4f7b-af2b-ca4ef77734cf",
          "name": "query playlist_tracks",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "numberInputs": 3
          },
          "type": "n8n-nodes-base.merge",
          "typeVersion": 3.2,
          "position": [
            1056,
            2336
          ],
          "id": "f9add17f-2fc9-4b35-9b9e-afbf21e29edc",
          "name": "missing track for playlists"
        },
        {
          "parameters": {
            "fieldsToAggregate": {
              "fieldToAggregate": [
                {
                  "fieldToAggregate": "count"
                }
              ]
            },
            "options": {}
          },
          "type": "n8n-nodes-base.aggregate",
          "typeVersion": 1,
          "position": [
            880,
            2112
          ],
          "id": "82a78312-4dcd-478e-b082-005bc49bd46a",
          "name": "Aggregate db count"
        },
        {
          "parameters": {
            "fieldsToAggregate": {
              "fieldToAggregate": [
                {
                  "fieldToAggregate": "tracks.total",
                  "renameField": true,
                  "outputFieldName": "spotify_totals"
                }
              ]
            },
            "options": {}
          },
          "type": "n8n-nodes-base.aggregate",
          "typeVersion": 1,
          "position": [
            624,
            2272
          ],
          "id": "eb650346-5aae-429e-877b-9739231af9ad",
          "name": "Aggregate spotify data"
        },
        {
          "parameters": {
            "fieldsToAggregate": {
              "fieldToAggregate": [
                {
                  "fieldToAggregate": "id",
                  "renameField": true,
                  "outputFieldName": "playlist_ids"
                }
              ]
            },
            "options": {}
          },
          "type": "n8n-nodes-base.aggregate",
          "typeVersion": 1,
          "position": [
            624,
            2464
          ],
          "id": "67a03a6f-3646-4c26-aca6-f35ea90a22f9",
          "name": "Aggregate spotify ids"
        },
        {
          "parameters": {
            "url": "=https://api.spotify.com/v1/playlists/{{ $json.id }}/tracks?offset=0&limit=100",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "spotifyOAuth2Api",
            "options": {
              "response": {
                "response": {
                  "responseFormat": "json"
                }
              },
              "pagination": {
                "pagination": {
                  "paginationMode": "responseContainsNextURL",
                  "nextURL": "={{ $response.body.next }}",
                  "paginationCompleteWhen": "other",
                  "completeExpression": "={{$response.body.next === null}}",
                  "requestInterval": 100
                }
              }
            }
          },
          "type": "n8n-nodes-base.httpRequest",
          "typeVersion": 4.2,
          "position": [
            1984,
            2272
          ],
          "id": "a8773504-3663-475c-b57d-06f7caf9c526",
          "name": "get all tracks for playlist",
          "alwaysOutputData": false,
          "credentials": {
            "spotifyOAuth2Api": {
              "id": "spotify-cred-id",
              "name": "Spotify account"
            }
          }
        },
        {
          "parameters": {
            "jsCode": "let data = {\n  count: [0],\n  spotify_totals: [0],\n  playlist_ids: ['']\n}\n\nfor (const input of $input.all()) {\n  if (input.json.count) {\n    data.count = input.json.count\n  }\n  if (input.json.spotify_totals) {\n    data.spotify_totals = input.json.spotify_totals\n  }\n  if (input.json.playlist_ids) {\n    data.playlist_ids = input.json.playlist_ids\n  }\n}\n\nlet retData = []\n\nfor (let index = 0; index < data.playlist_ids.length; index++) {\n  const playlist_id = data.playlist_ids[index];\n  const dbCount = data.count[index];\n  const spotifyTotal = data.spotify_totals[index];\n  if(dbCount !== spotifyTotal) {\n    retData.push({\n      id:playlist_id,\n      dbCount,\n      spotifyTotal,\n      diff: spotifyTotal - dbCount\n    })\n  }\n}\n\nreturn retData;"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            1264,
            2320
          ],
          "id": "3d7e9a5f-a1ec-41f1-b756-b4507537b220",
          "name": "filter out synced playlists"
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "album",
            "id": "={{ $json.album_id }}",
            "data": "={{ $json.album }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            3472,
            2160
          ],
          "id": "c07771d1-c811-4812-a1aa-931316c1ae5e",
          "name": "Upsert album",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "options": {}
          },
          "type": "n8n-nodes-base.splitInBatches",
          "typeVersion": 3,
          "position": [
            1712,
            2064
          ],
          "id": "2b9a3f57-4678-4c2c-8215-7b74a87c2631",
          "name": "Loop Over Items"
        },
        {
          "parameters": {
            "amount": 0.5
          },
          "type": "n8n-nodes-base.wait",
          "typeVersion": 1.1,
          "position": [
            3936,
            2352
          ],
          "id": "3c92d837-8a21-45b2-9448-3c8dcd4042af",
          "name": "Wait",
          "webhookId": "120a548b-67b4-428f-b457-c30c6023181f"
        },
        {
          "parameters": {
            "sortFieldsUi": {
              "sortField": [
                {
                  "fieldName": "diff"
                }
              ]
            },
            "options": {}
          },
          "type": "n8n-nodes-base.sort",
          "typeVersion": 1,
          "position": [
            1488,
            2320
          ],
          "id": "de0e99c6-8989-434b-9848-07bf6213051a",
          "name": "Sort by diff ASC"
        },
        {
          "parameters": {
            "numberInputs": 7
          },
          "type": "n8n-nodes-base.merge",
          "typeVersion": 3.2,
          "position": [
            3696,
            1984
          ],
          "id": "8988cf7d-9c5f-43e0-91be-8bebecef09d4",
          "name": "Merge"
        },
        {
          "parameters": {
            "resource": "relationship",
            "fromRecordId": "=album:{{ $json.album_id }}",
            "relationshipType": "album_track",
            "toRecordId": "=track:{{ $json.track_id }}",
            "options": {},
            "connectionPooling": {
              "retryAttempts": 0
            }
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            3472,
            2352
          ],
          "id": "df731b6a-370c-4dd7-9624-3aaf22e7d914",
          "name": "album_track",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=DELETE from playlist_track where in=playlist:{{ $('Loop Over Items').item.json.id }};",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            2432,
            1984
          ],
          "id": "0c2fbd25-2e83-4b53-9406-c3c4e0f09252",
          "name": "delete all playlist_track items for playlist",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=RELATE playlist:{{ $json.playlist_id }}->playlist_track->track:{{ $json.track_id }} SET added_at = d'{{ $json.added_at }}';",
            "options": {},
            "connectionPooling": {
              "retryAttempts": 0
            }
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            3472,
            1776
          ],
          "id": "b7eee354-6cc7-473b-b338-63557952ec4d",
          "name": "playlist_track",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "track",
            "id": "={{ $json.track_id }}",
            "data": "={{ $json.track }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            3472,
            1968
          ],
          "id": "b8e1bf62-cf8a-4345-bba1-6a503ed82712",
          "name": "Upsert track from playlist",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "playlist",
            "id": "={{ $json.playlist_id }}",
            "data": "={{ $json.playlist }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            608,
            -256
          ],
          "id": "2a197992-94cb-4036-aa40-c3b25a80846f",
          "name": "Upsert playlist",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "resource": "playlist",
            "operation": "getUserPlaylists",
            "returnAll": true
          },
          "type": "n8n-nodes-base.spotify",
          "typeVersion": 1,
          "position": [
            64,
            208
          ],
          "id": "9cfaaf92-e1e6-474c-8b7a-3cca9f8c847d",
          "name": "Get a user's playlists",
          "executeOnce": false,
          "credentials": {
            "spotifyOAuth2Api": {
              "id": "spotify-cred-id",
              "name": "Spotify account"
            }
          }
        },
        {
          "parameters": {
            "resource": "relationship",
            "fromRecordId": "=user:`{{ $('upsert me').item.json.id.id }}`",
            "relationshipType": "has_playlist",
            "toRecordId": "=playlist:{{ $json.playlist_id }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            608,
            -64
          ],
          "id": "c60344bd-0c9e-4532-90e2-b21a791164bc",
          "name": "has_playlist",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {
            "resource": "relationship",
            "fromRecordId": "=user:`{{ $json.owner_id }}`",
            "relationshipType": "playlist_owner",
            "toRecordId": "=playlist:{{ $json.playlist_id }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            608,
            128
          ],
          "id": "c2e3801c-c1fc-4f90-bee0-9f7e8eb455ce",
          "name": "playlist_owner",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "user",
            "id": "={{ $json.owner_id }}",
            "data": "={{ $json.owner }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            608,
            320
          ],
          "id": "ff96e6a3-c5cc-489a-bf83-914a65aac95f",
          "name": "upsert_user as owner",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "jsCode": "const payload = []\nfor (const item of $input.all()) {\n  const {owner, tracks, ...playlistRest} = item.json\n  const {id, ...playlist} = playlistRest\n  const {id: owner_id, ...ownerRest} = owner\n  payload.push({owner:ownerRest, tracks,playlist, playlist_id:id, owner_id })\n}\n\nreturn payload;"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            288,
            208
          ],
          "id": "9170ea5c-c9fd-4cf9-921c-5c0f66b2674e",
          "name": "remap keys and restructure"
        },
        {
          "parameters": {
            "resource": "library",
            "returnAll": true
          },
          "type": "n8n-nodes-base.spotify",
          "typeVersion": 1,
          "position": [
            1184,
            1248
          ],
          "id": "fb4e5977-077b-49d0-bffc-909953195702",
          "name": "Get liked tracks",
          "credentials": {
            "spotifyOAuth2Api": {
              "id": "spotify-cred-id",
              "name": "Spotify account"
            }
          }
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "track",
            "id": "={{ $json.track_id }}",
            "data": "={{ $json.track }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            1856,
            864
          ],
          "id": "dde0f6b3-ddce-4ded-b30c-1fb29e39cec6",
          "name": "Upsert track",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=RELATE {{ $('upsert me').item.json.id.tb }}:{{ $('upsert me').item.json.id.id }}->likes_track->track:{{ $json.track_id }} SET added_at = d'{{ $json.added_at }}';",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            1856,
            640
          ],
          "id": "bd64308f-1bc8-45d0-8d47-04cf350470a0",
          "name": "me likes",
          "notesInFlow": false,
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {},
          "type": "n8n-nodes-base.noOp",
          "typeVersion": 1,
          "position": [
            960,
            672
          ],
          "id": "1574cb4e-bf5d-4df5-beb6-aa5c0d1c0469",
          "name": "Liked songs in sync"
        },
        {
          "parameters": {
            "jsCode": "return [{run:1}];"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            960,
            1072
          ],
          "id": "8a7d18e0-c985-43c0-b3e9-2d83d37c7a91",
          "name": "dummy single run"
        },
        {
          "parameters": {
            "jsCode": "return {message: \"Sync success\"}"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            2080,
            928
          ],
          "id": "5d094c3c-370d-472a-851f-e5f14987fb2d",
          "name": "success"
        },
        {
          "parameters": {
            "jsCode": "return {message: \"Sync error\"}"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            2080,
            1120
          ],
          "id": "2138387c-dd76-40a4-b7d1-91600e1b7a63",
          "name": "error"
        },
        {
          "parameters": {
            "jsCode": "const retArray = []\n\nfor (const item of $input.all()) {\n  const {id, album, ...restTrack} = item.json.track\n  const {id: album_id, ...restAlbum} = album\n  \n  retArray.push({\n    track_id:id, \n    album_id, \n    album:restAlbum, \n    track: restTrack,\n    added_at:item.json.added_at\n  })\n}\n\nreturn retArray;"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            1360,
            1248
          ],
          "id": "53ae34b0-28e0-4dde-bfa0-6da213635748",
          "name": "modify output"
        },
        {
          "parameters": {
            "mode": "combine",
            "advanced": true,
            "mergeByFields": {
              "values": [
                {
                  "field1": "out.id",
                  "field2": "track_id"
                }
              ]
            },
            "joinMode": "keepNonMatches",
            "outputDataFrom": "input2",
            "options": {}
          },
          "type": "n8n-nodes-base.merge",
          "typeVersion": 3.2,
          "position": [
            1552,
            928
          ],
          "id": "0a67c772-e42a-4f26-9536-589e45aa2b21",
          "name": "match only missing tracks"
        },
        {
          "parameters": {
            "url": "https://api.spotify.com/v1/me/tracks",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "spotifyOAuth2Api",
            "sendQuery": true,
            "queryParameters": {
              "parameters": [
                {
                  "name": "fields",
                  "value": "=total"
                }
              ]
            },
            "options": {}
          },
          "type": "n8n-nodes-base.httpRequest",
          "typeVersion": 4.2,
          "position": [
            272,
            1088
          ],
          "id": "ffcab92b-ff2b-47f7-8e37-ed62f2427497",
          "name": "get tracks total",
          "credentials": {
            "spotifyOAuth2Api": {
              "id": "spotify-cred-id",
              "name": "Spotify account"
            }
          }
        },
        {
          "parameters": {
            "resource": "relationship",
            "fromRecordId": "=album:{{ $json.album_id }}",
            "relationshipType": "album_track",
            "toRecordId": "=track:{{ $json.track_id }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            1856,
            1264
          ],
          "id": "9de5abc5-202b-49a1-8c4f-18571b930dbb",
          "name": "album_track1",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {},
          "type": "n8n-nodes-base.noOp",
          "typeVersion": 1,
          "position": [
            64,
            880
          ],
          "id": "7a31f56e-12de-46f2-a622-930e05ad96f5",
          "name": "passthrough"
        },
        {
          "parameters": {
            "mode": "combine",
            "advanced": true,
            "mergeByFields": {
              "values": [
                {
                  "field1": "dbTotal",
                  "field2": "total"
                }
              ]
            },
            "options": {}
          },
          "type": "n8n-nodes-base.merge",
          "typeVersion": 3.2,
          "position": [
            512,
            880
          ],
          "id": "378265c5-6ecd-4a65-857f-0fc442696e4f",
          "name": "merge local & spotify",
          "alwaysOutputData": true
        },
        {
          "parameters": {
            "content": "# Sync liked tracks",
            "height": 848,
            "width": 2304,
            "color": 6
          },
          "type": "n8n-nodes-base.stickyNote",
          "typeVersion": 1,
          "position": [
            -16,
            624
          ],
          "id": "1cc7511a-555b-48fb-a260-f38294f3639e",
          "name": "Sticky Note"
        },
        {
          "parameters": {
            "content": "# Sync playlists",
            "height": 848,
            "width": 912,
            "color": 7
          },
          "type": "n8n-nodes-base.stickyNote",
          "typeVersion": 1,
          "position": [
            -16,
            -320
          ],
          "id": "404958a8-c58c-44cc-af79-1254ffab9d3f",
          "name": "Sticky Note2"
        },
        {
          "parameters": {
            "content": "# Sync playlists tracks",
            "height": 1232,
            "width": 4288,
            "color": 4
          },
          "type": "n8n-nodes-base.stickyNote",
          "typeVersion": 1,
          "position": [
            -16,
            1568
          ],
          "id": "38e75dbd-ce7f-491e-8b64-85b560ce2100",
          "name": "Sticky Note1"
        },
        {
          "parameters": {
            "conditions": {
              "options": {
                "caseSensitive": true,
                "leftValue": "",
                "typeValidation": "strict",
                "version": 2
              },
              "conditions": [
                {
                  "id": "3478646e-57f4-49e0-a241-29aefe83332e",
                  "leftValue": "={{$json}}",
                  "rightValue": "",
                  "operator": {
                    "type": "object",
                    "operation": "notEmpty",
                    "singleValue": true
                  }
                }
              ],
              "combinator": "and"
            },
            "options": {}
          },
          "type": "n8n-nodes-base.if",
          "typeVersion": 2.2,
          "position": [
            2192,
            2128
          ],
          "id": "ab52f96a-99ab-4228-8a81-2c424ec62d86",
          "name": "with result"
        },
        {
          "parameters": {
            "mode": "chooseBranch",
            "useDataOfInput": 2
          },
          "type": "n8n-nodes-base.merge",
          "typeVersion": 3.2,
          "position": [
            2672,
            2176
          ],
          "id": "359246a9-338f-4dd7-90f9-e47814158560",
          "name": "fwd input 2"
        },
        {
          "parameters": {
            "jsCode": "function slugify(str) {\n  return str\n    .toLowerCase()\n    .trim()\n    .replace(/[\\s\\W-]+/g, '_') // Replace spaces and non-word chars with -\n    .replace(/^-+|-+$/g, '');  // Remove leading/trailing -\n}\n\nfunction idFromLocal(uri) {\n  const onlyValue = uri.replace(\"spotify:local:\", \"\");\n  // const parts = onlyValue.split(\":\");\n  // const artist = parts[0];\n  // const album = parts[2];\n  // const track = parts[1];\n  // const duration = parts[3];\n  return slugify(decodeURIComponent(onlyValue));\n}\n\nconst url = $input.first().json.href;\nconst match = url.match(/\\/playlists\\/([^/]+)(?:\\/|$)/);\nconst playlist_id = match ? match[1] : null;\nlet allItems = [];\n\n// Loop over input items and add a new field called 'myNewField' to the JSON of each one\nfor (const item of $input.all()) {\n  for (const i of item.json.items) {\n    if (i.track) {\n      const {\n        id: origId,\n        album: { id: album_id, ...restAlbum },\n        ...restItem\n      } = i.track;\n      let id = origId;\n      if (!origId) {\n        // need to create a meaningful id\n        id = idFromLocal(restItem.uri);\n      }\n\n      const _i = Object.assign(\n        {},\n        i,\n        { track: restItem },\n        {\n          album: restAlbum,\n          album_id,\n          playlist_id,\n          track_id: id,\n        }\n      );\n      allItems.push(_i);\n    } else {\n      console.log(\"Missing track\", item);\n    }\n  }\n}\n\nreturn allItems;\n"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            2848,
            2048
          ],
          "id": "db2ebc1f-8dc5-4b89-b62a-d57754606f41",
          "name": "restructure payload"
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "album",
            "id": "={{ $json.album_id }}",
            "data": "={{ $json.album }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            1856,
            1072
          ],
          "id": "f33f059a-fdd5-4a11-9b73-786bc75fa47f",
          "name": "Upsert album from liked tracks",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=select count() as dbTotal from likes_track where in = {{$json.id.tb}}:{{ $json.id.id }} group all;",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            288,
            752
          ],
          "id": "cd6aead8-ea11-4560-b00b-a97e2445d56a",
          "name": "get liked tracks count",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "resource": "query",
            "query": "=select * from likes_track where in = {{$('upsert me').item.json.id.tb}}:{{ $('upsert me').item.json.id.id }};",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            1184,
            944
          ],
          "id": "09b652da-9ebc-41da-a2b3-728c2b5ef41d",
          "name": "get all liked tracks",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {},
          "type": "n8n-nodes-base.noOp",
          "typeVersion": 1,
          "position": [
            1968,
            1856
          ],
          "id": "901b412c-9fb7-45cf-88a5-267fb7086277",
          "name": "done iterating"
        },
        {
          "parameters": {
            "conditions": {
              "options": {
                "caseSensitive": true,
                "leftValue": "",
                "typeValidation": "loose",
                "version": 2
              },
              "conditions": [
                {
                  "id": "cc28f07a-1fff-41e4-92ec-69e99084fe96",
                  "leftValue": "={{ $json }}",
                  "rightValue": "",
                  "operator": {
                    "type": "object",
                    "operation": "notEmpty",
                    "singleValue": true
                  }
                },
                {
                  "id": "e418c917-e9cb-4493-b074-74f426f7f760",
                  "leftValue": "={{ $json.total }}",
                  "rightValue": "={{ $json.dbTotal }}",
                  "operator": {
                    "type": "string",
                    "operation": "equals"
                  }
                }
              ],
              "combinator": "and"
            },
            "looseTypeValidation": true,
            "options": {
              "ignoreCase": false
            }
          },
          "type": "n8n-nodes-base.if",
          "typeVersion": 2.2,
          "position": [
            736,
            880
          ],
          "id": "7c0d65c7-6006-4734-8d30-1f869bbadffe",
          "name": "in sync"
        },
        {
          "parameters": {
            "operation": "upsertRecord",
            "table": "artist",
            "id": "={{ $json.item.artistId }}",
            "data": "={{ $json.item }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            448,
            -720
          ],
          "id": "164964c6-e01c-4623-a9f8-c1a7bdf12b83",
          "name": "Upsert artists",
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        },
        {
          "parameters": {
            "resource": "myData",
            "returnAll": true
          },
          "type": "n8n-nodes-base.spotify",
          "typeVersion": 1,
          "position": [
            32,
            -720
          ],
          "id": "707e2586-f9d3-4847-beee-56d2083cef32",
          "name": "Get your followed artists",
          "credentials": {
            "spotifyOAuth2Api": {
              "id": "spotify-cred-id",
              "name": "Spotify account"
            }
          }
        },
        {
          "parameters": {
            "resource": "relationship",
            "fromRecordId": "={{$('upsert me').item.json.id.tb}}:{{$('upsert me').item.json.id.id}}",
            "relationshipType": "follows",
            "toRecordId": "={{ $json.id.tb }}:{{ $json.id.id }}",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            688,
            -720
          ],
          "id": "82396689-12d8-4282-a7be-d79a2d19ca62",
          "name": "Create a relationship",
          "notesInFlow": false,
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          },
          "onError": "continueErrorOutput"
        },
        {
          "parameters": {
            "jsCode": "// Loop over input items and add a new field called 'myNewField' to the JSON of each one\nconst ret = []\nfor (const item of $input.all()) {\n  ret.push({item: {...item.json, artistId: item.json.id}})\n}\n\nreturn ret;"
          },
          "type": "n8n-nodes-base.code",
          "typeVersion": 2,
          "position": [
            240,
            -720
          ],
          "id": "3b3139b3-0d72-4c42-a6d7-cd6e03174fea",
          "name": "add artistId"
        },
        {
          "parameters": {
            "content": "# Sync following artists",
            "height": 432,
            "width": 1072,
            "color": 2
          },
          "type": "n8n-nodes-base.stickyNote",
          "typeVersion": 1,
          "position": [
            -16,
            -848
          ],
          "id": "a9ac44c1-f319-4a81-b141-4b564ef6fabb",
          "name": "Sticky Note3"
        },
        {
          "parameters": {
            "resource": "query",
            "query": "DEFINE TABLE IF NOT EXISTS album TYPE ANY SCHEMALESS PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS album_id_idx ON album FIELDS id UNIQUE; DEFINE INDEX IF NOT EXISTS album_uri_idx ON album FIELDS uri UNIQUE; -- DEFINE TABLE IF NOT EXISTS artist TYPE ANY SCHEMALESS PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS artist_id_idx ON artist FIELDS id UNIQUE; DEFINE INDEX IF NOT EXISTS artist_uri_idx ON artist FIELDS uri UNIQUE; -- DEFINE TABLE IF NOT EXISTS playlist TYPE ANY SCHEMALESS PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS snapshot_id ON playlist FIELDS snapshot_id; DEFINE INDEX IF NOT EXISTS playlist_uri_idx ON playlist FIELDS uri UNIQUE; -- DEFINE TABLE IF NOT EXISTS track TYPE NORMAL SCHEMALESS PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS track_index ON track FIELDS id UNIQUE; DEFINE INDEX IF NOT EXISTS track_uri_idx ON track FIELDS uri UNIQUE; -- DEFINE TABLE IF NOT EXISTS user TYPE NORMAL SCHEMALESS PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS user_idx ON user FIELDS id UNIQUE; DEFINE INDEX IF NOT EXISTS user_uri_idx ON user FIELDS uri UNIQUE; -- DEFINE TABLE IF NOT EXISTS album_track TYPE RELATION IN album OUT track SCHEMAFULL PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS album_track ON album_track FIELDS in, out UNIQUE; -- DEFINE TABLE IF NOT EXISTS follows TYPE RELATION IN user OUT artist SCHEMAFULL PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS user_follow_artist ON follows FIELDS in, out UNIQUE; -- DEFINE TABLE IF NOT EXISTS has_playlist TYPE RELATION IN user OUT playlist SCHEMALESS PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS user_playlist ON has_playlist FIELDS in, out UNIQUE; -- DEFINE TABLE IF NOT EXISTS likes_track TYPE RELATION IN user OUT track SCHEMALESS PERMISSIONS NONE; DEFINE FIELD IF NOT EXISTS added_at ON likes_track TYPE datetime PERMISSIONS FULL; DEFINE INDEX IF NOT EXISTS user_likes_track ON likes_track FIELDS in, out UNIQUE; -- DEFINE TABLE IF NOT EXISTS playlist_owner TYPE RELATION IN user OUT playlist SCHEMAFULL PERMISSIONS NONE; DEFINE INDEX IF NOT EXISTS playlist_owner_idx ON playlist_owner FIELDS in, out UNIQUE; -- DEFINE TABLE IF NOT EXISTS playlist_track TYPE RELATION IN playlist OUT track SCHEMALESS PERMISSIONS NONE; DEFINE FIELD IF NOT EXISTS added_at ON playlist_track TYPE datetime PERMISSIONS FULL; DEFINE INDEX IF NOT EXISTS playlist_track_id_idx ON playlist_track FIELDS id UNIQUE;",
            "options": {},
            "connectionPooling": {}
          },
          "type": "n8n-nodes-surrealdb.surrealDb",
          "typeVersion": 1,
          "position": [
            -1216,
            1184
          ],
          "id": "78bc580e-7544-4f91-981b-5c9b36295d30",
          "name": "setup database",
          "alwaysOutputData": true,
          "credentials": {
            "surrealDbApi": {
              "id": "surrealdb-cred-id",
              "name": "SurrealDB cloud account"
            }
          }
        }
      ],
      "connections": {
        "Schedule Trigger": {
          "main": [
            [
              {
                "node": "setup database",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "clean payload": {
          "main": [
            [
              {
                "node": "Upsert track from playlist",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "my playlists": {
          "main": [
            [
              {
                "node": "combine all calls",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "synced playlists": {
          "main": [
            [
              {
                "node": "missing playlists",
                "type": "main",
                "index": 1
              }
            ]
          ]
        },
        "missing playlists": {
          "main": [
            [
              {
                "node": "Loop Over Items",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "query playlist with last snapshot": {
          "main": [
            [
              {
                "node": "playlists that need sync",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "playlists that need sync": {
          "main": [
            [
              {
                "node": "Loop Over Items",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "get me": {
          "main": [
            [
              {
                "node": "upsert me",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "upsert me": {
          "main": [
            [
              {
                "node": "my playlists",
                "type": "main",
                "index": 0
              },
              {
                "node": "Get a user's playlists",
                "type": "main",
                "index": 0
              },
              {
                "node": "passthrough",
                "type": "main",
                "index": 0
              },
              {
                "node": "Get your followed artists",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "combine all calls": {
          "main": [
            [
              {
                "node": "synced playlists",
                "type": "main",
                "index": 0
              },
              {
                "node": "missing playlists",
                "type": "main",
                "index": 0
              },
              {
                "node": "query playlist with last snapshot",
                "type": "main",
                "index": 0
              },
              {
                "node": "query playlist_tracks",
                "type": "main",
                "index": 0
              },
              {
                "node": "Aggregate spotify data",
                "type": "main",
                "index": 0
              },
              {
                "node": "Aggregate spotify ids",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "query playlist_tracks": {
          "main": [
            [
              {
                "node": "Aggregate db count",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "missing track for playlists": {
          "main": [
            [
              {
                "node": "filter out synced playlists",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Aggregate db count": {
          "main": [
            [
              {
                "node": "missing track for playlists",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Aggregate spotify data": {
          "main": [
            [
              {
                "node": "missing track for playlists",
                "type": "main",
                "index": 1
              }
            ]
          ]
        },
        "Aggregate spotify ids": {
          "main": [
            [
              {
                "node": "missing track for playlists",
                "type": "main",
                "index": 2
              }
            ]
          ]
        },
        "get all tracks for playlist": {
          "main": [
            [
              {
                "node": "with result",
                "type": "main",
                "index": 0
              },
              {
                "node": "fwd input 2",
                "type": "main",
                "index": 1
              }
            ]
          ]
        },
        "filter out synced playlists": {
          "main": [
            [
              {
                "node": "Sort by diff ASC",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Upsert album": {
          "main": [
            [
              {
                "node": "Merge",
                "type": "main",
                "index": 4
              }
            ]
          ]
        },
        "Loop Over Items": {
          "main": [
            [
              {
                "node": "done iterating",
                "type": "main",
                "index": 0
              }
            ],
            [
              {
                "node": "get all tracks for playlist",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Wait": {
          "main": [
            [
              {
                "node": "Loop Over Items",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Sort by diff ASC": {
          "main": [
            [
              {
                "node": "Loop Over Items",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Merge": {
          "main": [
            [
              {
                "node": "Wait",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "album_track": {
          "main": [
            [
              {
                "node": "Merge",
                "type": "main",
                "index": 6
              }
            ],
            [
              {
                "node": "Merge",
                "type": "main",
                "index": 5
              }
            ]
          ]
        },
        "delete all playlist_track items for playlist": {
          "main": [
            [
              {
                "node": "fwd input 2",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "playlist_track": {
          "main": [
            [
              {
                "node": "Merge",
                "type": "main",
                "index": 2
              }
            ],
            [
              {
                "node": "Merge",
                "type": "main",
                "index": 3
              }
            ]
          ]
        },
        "Upsert track from playlist": {
          "main": [
            [
              {
                "node": "Merge",
                "type": "main",
                "index": 0
              }
            ],
            [
              {
                "node": "Merge",
                "type": "main",
                "index": 1
              }
            ]
          ]
        },
        "Get a user's playlists": {
          "main": [
            [
              {
                "node": "remap keys and restructure",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "remap keys and restructure": {
          "main": [
            [
              {
                "node": "Upsert playlist",
                "type": "main",
                "index": 0
              },
              {
                "node": "has_playlist",
                "type": "main",
                "index": 0
              },
              {
                "node": "playlist_owner",
                "type": "main",
                "index": 0
              },
              {
                "node": "upsert_user as owner",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Get liked tracks": {
          "main": [
            [
              {
                "node": "modify output",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Upsert track": {
          "main": [
            [
              {
                "node": "success",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "me likes": {
          "main": [
            [
              {
                "node": "success",
                "type": "main",
                "index": 0
              }
            ],
            [
              {
                "node": "error",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "dummy single run": {
          "main": [
            [
              {
                "node": "Get liked tracks",
                "type": "main",
                "index": 0
              },
              {
                "node": "get all liked tracks",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "modify output": {
          "main": [
            [
              {
                "node": "match only missing tracks",
                "type": "main",
                "index": 1
              }
            ]
          ]
        },
        "match only missing tracks": {
          "main": [
            [
              {
                "node": "me likes",
                "type": "main",
                "index": 0
              },
              {
                "node": "Upsert track",
                "type": "main",
                "index": 0
              },
              {
                "node": "Upsert album from liked tracks",
                "type": "main",
                "index": 0
              },
              {
                "node": "album_track1",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "get tracks total": {
          "main": [
            [
              {
                "node": "merge local & spotify",
                "type": "main",
                "index": 1
              }
            ]
          ]
        },
        "album_track1": {
          "main": [
            [
              {
                "node": "success",
                "type": "main",
                "index": 0
              }
            ],
            [
              {
                "node": "error",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "passthrough": {
          "main": [
            [
              {
                "node": "get liked tracks count",
                "type": "main",
                "index": 0
              },
              {
                "node": "get tracks total",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "merge local & spotify": {
          "main": [
            [
              {
                "node": "in sync",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "with result": {
          "main": [
            [
              {
                "node": "delete all playlist_track items for playlist",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "fwd input 2": {
          "main": [
            [
              {
                "node": "restructure payload",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "restructure payload": {
          "main": [
            [
              {
                "node": "album_track",
                "type": "main",
                "index": 0
              },
              {
                "node": "Upsert album",
                "type": "main",
                "index": 0
              },
              {
                "node": "clean payload",
                "type": "main",
                "index": 0
              },
              {
                "node": "playlist_track",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Upsert album from liked tracks": {
          "main": [
            [
              {
                "node": "success",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "get liked tracks count": {
          "main": [
            [
              {
                "node": "merge local & spotify",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "get all liked tracks": {
          "main": [
            [
              {
                "node": "match only missing tracks",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "in sync": {
          "main": [
            [
              {
                "node": "Liked songs in sync",
                "type": "main",
                "index": 0
              }
            ],
            [
              {
                "node": "dummy single run",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Upsert artists": {
          "main": [
            [
              {
                "node": "Create a relationship",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "Get your followed artists": {
          "main": [
            [
              {
                "node": "add artistId",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "add artistId": {
          "main": [
            [
              {
                "node": "Upsert artists",
                "type": "main",
                "index": 0
              }
            ]
          ]
        },
        "setup database": {
          "main": [
            [
              {
                "node": "get me",
                "type": "main",
                "index": 0
              }
            ]
          ]
        }
      }
    }
    ```
    

### Replacing placeholders in JSON

Once you copied the json to text editor search for `surrealdb-cred-id`, it should be inside the structure like this:

```json
...
"credentials": {
  "surrealDbApi": {
    "id": "surrealdb-cred-id",
    "name": "SurrealDB spotify"
  }
}
...
```

Replace ALL occurrences with the ID which you can get when you click on the credential in the UI. The ID is in the URL, just before the `?uiContext=credentials_list`.

Do exactly the same for Spotify, but in this case search for `spotify-cred-id`.  You should see it in this structure:

```json
...
"credentials": {
  "spotifyOAuth2Api": {
    "id": "spotify-cred-id",
    "name": "Spotify account"
  }
}
...
```

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

The last one, `Sync playlist tracks` is the biggest one and most complex. This sub flow fetches all the playlists i have and all the tracks in these playlists then it process them creating different relations, creating track records and extracting, creation albums and creating relations to tracks. At the end of the sync you will have a graph of your library. As we decided to use the SurrealDB, we are creating relations as the [Graph Edges](https://surrealdb.com/docs/surrealdb/models/graph#creating-edges-relationships) like `likes_track` or `playlist_track` .

We also implemented DB checks, where needed, to minimize calls to Spotify API because we don’t want to trigger `Too many requests` error. We’ve accomplished this be combining the custom http n8n nodes and native Spotify integration. 

![Database design image with relations and table names.](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%207.png)

Database design image with relations and table names.

In my case, a library building spanning a decade, with over twenty thousand tracks, i needed the simplicity and robustness when it comes to the inserting and updating the data. It’s a good thing that SurrealDB has amazing functionality called `UPSERT` that is really fast, they way it works is to define and unique index and start using it, in case of the new record it will be created, in case of existing and update. This simplifies workflow a lot, because i don’t have to make extra calls and implement logic for the new vs existing record. 

Important thing to notice is that due to some, for the lack of better word, weirdness in n8n and SurrealDB node package i had to implement many hacks like `restructuring the payload` or checks that relations exist, etc …

## Quirks and weirdness

Example of the n8n weirdness:

If you look ad the `Sync following artists` you will notice a Code Node called `add artistsId`, for some reason once the `Upsert artists` is executed, the Spotify Node output is changed and the id was missing. The SurrealDB node returns the id as an object where the id coming from Spotify is a string. For that reason, adding a new field that doesn’t exist in either of the nodes fixes the issue. I’d say this is the most common hack i had to do, it’s all over the workflow.

Example of the SurrealDB n8n package:

If you define a field as a `datetime` in the SurrealDB schema, there is no way to add it as a value to the relation, it will default to string and this will raise the error. The only way is to use Query Node, which has its own quirks and weirdness. 

For example; If you use Query Node in SurrealDB and set the Retry Count to `0` it will not be picked up and it will always default to `4` which is inside the code, this alone can make the sync a lot longer, especially when creating thousands of relations. It means that if the relation exists it will try to do 4 times to save it, and it will always fail. In our Node we can always state that the Error is not an Workflow stopping, rather a notification. I plan to submit the PR to fix issues i mentioned. 

Spotify API responses:

There is one playlist in my library that gets synced all the time, it’s called [`must know`](https://open.spotify.com/playlist/4DbKOVVmWllXWpCmGLWCjR?si=26854f33abd04e77), it says in the Spotify app that contains 133 songs, but the API returns 134, and the sync always runs for that playlist. I went on debugging it and noticed that i have left myself clues if something obvious cannot be processed like “mandatory” track key in the list of items from the API response. It turns out that they allow for the `track` to be `null`, no ID no nothing just an empty reference.

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%208.png)

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

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%209.png)

Metrics are only available in the cloud, not in the Surrealist desktop

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2010.png)

- Workflow screenshots
    
    ![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2011.png)
    
    ![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2012.png)
    
    ![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2013.png)
    
    ![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2014.png)
    
    ![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2015.png)
    

## My Stats

My entire Spotify library requires 93MB, this only includes the information about the songs, playlists and albums. We never download actual songs.

![image.png](Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2016.png)

From this table you can see that i have 23526 tracks synced, across the playlists and `My library` which we call `Likes`. I have 116 playlists and in 16102 albums that are extracted from the songs(tracks). Whats yours?

| Type | Count |
| --- | --- |
| tracks | 23526 |
| albums | 16102 |
| playlists | 116 |
| liked songs | 1517 |

<aside>
🖖🏽

Let me know what else would you like to see in this flow.

</aside>