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

![Cloud based instance. Create namespace](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image.png)

Cloud based instance. Create namespace

![Create new Database](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%201.png)

Create new Database

Next step is to set up Database authentication

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%202.png)

Select `New system user`

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%203.png)

Create user and password

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%204.png)

## Step Four: Connect SurrealDB and n8n

Now, go to your n8n and create a credential. Search for SurrealDB

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%205.png)

And click continue.

Fill in the details and save. The `Connection String` you can find when you click on SurrealDB dashboard and select `Instance actions`.  From there you can `Copy hostname`. This should be Saved and tested.

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%206.png)

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

![Database design image with relations and table names.](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%207.png)

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

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%208.png)

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

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%209.png)

Metrics are only available in the cloud, not in the Surrealist desktop

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2010.png)

- Workflow screenshots

    ![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2011.png)

    ![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2012.png)

    ![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2013.png)

    ![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2014.png)

    ![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2015.png)


## My Stats

My entire Spotify library requires 93MB, this only includes the information about the songs, playlists and albums. We never download actual songs.

![image.png](assets/Spotify%20Account%20sync%20to%20SurrealDB%202946e1b9d513801d8abfcbaf85d1d26c/image%2016.png)

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
