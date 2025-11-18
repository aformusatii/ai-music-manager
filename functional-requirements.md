You will write a **Music Manager** web application with the features below.

Assumptions / General
- All API keys / secrets (Spotify, YouTube) must **not** be hard-coded. They must be read from configuration (e.g. environment variables or config file).
- The app must be usable behind a reverse proxy (avoid absolute URLs; use relative paths; no hard-coded hostnames).
- For simplicity, no user authentication is required (single-user system).
- The application must handle API errors and show understandable messages to the user (e.g. “Spotify search failed, please check your API key or network connection.”).

---

# Search and discover songs via Spotify API

- Implement a **“Spotify Search” page** with:
  - A search form that allows searching for **artists** by name using the Spotify Web API.
  - After selecting an artist (e.g. from a search results list), the app fetches that artist’s **albums** and their **tracks** via Spotify API.
  - Display the results as a **flat list of tracks**, where each row is one track and includes at least:
    - Track name
    - Artist name(s)
    - Album name
    - Track duration
    - Spotify track ID
    - Album release date (if available)
  - Ensure that if an artist has many albums/tracks, the UI:
    - Supports pagination or lazy loading, or
    - Clearly limits results (e.g. “show first 50 tracks”) and communicates this to the user.
  - Handle the case where:
    - No artists are found for a given query.
    - Artist has no albums or albums have no tracks.
    - Spotify rate limit or other API errors occur (show message instead of breaking).

- **Selecting tracks to add to local database**
  - Each track row must have a checkbox to select it for import into the local database.
  - There must be an option to:
    - Select / deselect all tracks currently shown on screen.
  - A button (e.g. “Add Selected to Local Library”) should:
    - Insert selected tracks into the local database with all fields provided by Spotify API, you can keep it as document in database.
    - Handle duplicates:
      - If a track with the same Spotify track ID already exists in the local database, do **not** create a duplicate.
      - Instead, skip or update the existing entry. The behavior should be deterministic and documented (e.g. “If track exists, update fields; do not create duplicate.”).
    - Show confirmation / summary (e.g. “10 tracks added, 3 skipped because they already exist.”).

- **Configuring Spotify API**
  - In the README, explain:
    - How to create a Spotify developer application.
    - How to obtain necessary credentials (Client ID, Client Secret, redirect URI if needed).
    - How to configure these credentials for the app (e.g. environment variables, config file).
  - If Spotify API requires OAuth for the chosen endpoints:
    - Describe in the README how the user will perform authorization.
    - If possible, implement a simple flow to obtain and refresh tokens, or document clearly if manual token entry is required.

- **Toggle visible track fields on search result page**
  - On the “Spotify Search” results page, provide a way (e.g. a dropdown or settings panel) for the user to toggle **visibility** of columns/fields:
    - For example, hide/show: album name, duration, release date, Spotify ID, etc.
  - The UI should:
    - Have reasonable default visible columns.
    - Dynamically show/hide columns without reloading the page.
  - Edge case:
    - If all columns are hidden, at least keep one minimal identifier (e.g. track name) visible or prevent the user from hiding all columns.

---

# Manage local database of tracks (view, filter, sort, update, delete)

- Implement a **“Local Tracks” page** which shows tracks stored in the local database as a **flat table**:
  - Each row represents one local track and includes:
    - Track name
    - Artist name(s)
    - Album name
    - Duration
    - Spotify track ID (if available)
    - Download status (e.g. “Not Downloaded”, “Download Pending”, “Downloaded”, “Download Failed”)
    - Local file path or filename (if downloaded)
    - Any other key metadata that was stored.
  - The table must support:
    - **Filtering** by:
      - Track name (text search)
      - Artist name
      - Album name
      - Download status
    - **Sorting** by:
      - Track name
      - Artist name
      - Album name
      - Duration
      - Download status
    - Implement sorting and filtering either on the server or the client, but:
      - It must work correctly for large lists (consider pagination).
      - Allow the user to configure maximum items on the page in the web ui

- **Toggle visible track fields on local tracks page**
  - Same behavior as for the Spotify search results:
    - User can toggle which columns are visible.
    - Changes should apply immediately in the UI.

- **Track download status field**
  - Local track records must store and display a **download status** with clear states such as:
    - `not_downloaded`
    - `download_pending`
    - `download_in_progress` (optional if not tracking live)
    - `downloaded`
    - `download_failed`
  - When a download is successfully completed:
    - Set status to `downloaded`.
    - Store the local file path (or relative path) to the downloaded audio file.
  - If a download fails:
    - Set status to `download_failed`.
    - Optionally store an error message or last error reason.

- **Action to delete a local track**
  - Each track must have an action (e.g. a “Delete” button) that:
    - Removes the track entry from the local database.
    - Optionally, ask the user if the associated downloaded file should also be deleted from disk (if it exists).
      - If implemented, clearly state behavior in the UI (e.g. a confirmation dialog with a checkbox).
  - Edge cases:
    - Track has no downloaded file: deleting should just remove the DB record.
    - File missing on disk: handle gracefully (no crash; maybe update status or show a warning).

- **Action to search and download from YouTube**
  - Each local track row must have an action (e.g. “Download from YouTube”) that:
    - Initiates a YouTube search based on the track metadata (e.g. `"artist name - track name"`).
    - Uses the YouTube Data API to find the best matching video (e.g. first result, or additional simple heuristics).
    - Then triggers a **download** using `yt-dlp` from the backend.
  - Additional details:
    - Before downloading, you may optionally allow the user to:
      - See the top 1–3 YouTube results and choose one (if that’s not too complex).
      - Otherwise, just auto-select the first result.
    - The download should:
      - Be audio-only (if possible, e.g. via yt-dlp options).
      - Store the output file in a configurable directory on the server.
      - Use a safe filename (no invalid characters, etc.).
    - While download is in progress:
      - Update status to `download_pending` or `download_in_progress`.
    - On completion or error:
      - Update the track’s status accordingly.
  - Edge cases:
    - No YouTube results found: show an error and set status to `download_failed`.
    - yt-dlp not installed or fails: log error and set status to `download_failed`.
    - Network failures: handle gracefully and set appropriate status.

---

# Youtube download

- On the **Local Tracks** page:
  - Provide a way to trigger YouTube download **per track** (as described above).
  - Optionally provide **bulk download**:
    - e.g. a “Download all not downloaded tracks” button.
    - This should queue or sequentially download each track via yt-dlp.
    - Respect basic rate limiting and handle partial failures.
  - The backend must:
    - Invoke `yt-dlp` programmatically via command line.
    - Capture success/failure for each invocation.
    - Not block the entire web server if a download takes a long time.
      - If full async processing is too complex, at least:
        - Explain in README that downloads are synchronous and may block; or
        - Use simple background processing (thread/process) if possible.

- **YouTube search via YouTube API**
  - Use the YouTube Data API to search for videos matching a given track, typically by:
    - Query string: `"artist name track name"` or similar.
  - Handle:
    - API quota exceeded.
    - Missing or invalid API keys.
    - No search results.
  - Show meaningful messages.

- **Configuring YouTube API**
  - In the README, explain:
    - How to create a YouTube/Google Cloud project, enable YouTube Data API.
    - How to obtain an API key or OAuth credentials.
    - How to configure the credentials for the app (e.g. environment variables, config file).
  - If OAuth is needed, document the flow or any manual steps.

---

# Playlist Management

- Implement a **Playlist** entity in the local database:
  - Playlist fields:
    - Playlist ID
    - Playlist name (required, unique per app or per user)
    - Optional description
    - Creation date
    - Last modified date
  - Relationship:
    - Many-to-many between playlists and tracks:
      - A playlist can contain many tracks.
      - A track can belong to multiple playlists.
    - Track order within playlist must be stored (e.g. position index).

- **Create playlists from local tracks**
  - Provide a **“Playlists” page** where:
    - User can create a new playlist (enter name and optional description).
    - User can view and manage existing playlists.
  - On the **Local Tracks** page:
    - Each track must have an action to “Add to playlist”.
    - This action should:
      - Allow user to select an existing playlist from a dropdown, or
      - Create a new playlist inline (if not too complex).
      - Add the track to the selected playlist at the end of the playlist order.
    - Prevent duplicates:
      - If the track is already in the chosen playlist, do not add it again, or at least inform the user.

- **View playlists page**
  - The Playlists page should:
    - List all playlists with basic info: name, number of tracks, creation date, last modified date.
    - Allow selecting a playlist to view its tracks.
  - When viewing a playlist, show a table of its tracks with relevant columns similar to Local Tracks:
    - Track name
    - Artist
    - Album
    - Duration
    - Download status
  - It should be possible to:
    - Reorder tracks in the playlist (e.g. move up/down, or drag-and-drop if feasible).
    - Remove a track from the playlist (but not delete it from the local library).

- **Manage playlist (add, update, delete)**
  - **Add**:
    - Create new playlists via a simple form (name required).
  - **Update**:
    - Edit playlist name and description.
  - **Delete**:
    - Delete an entire playlist.
    - Confirm before deletion.
    - Deleting a playlist should **not** delete tracks from the local database.
  - Edge cases:
    - Deleting a playlist that has tracks: ensure no orphaned references remain.
    - Renaming playlist to an already existing name: handle uniqueness constraints gracefully.

---

# Audio Player

- Implement a **Playlist Player** page:
  - Allows selecting a playlist and playing its tracks in sequence.
  - Uses a **popular JavaScript audio player library** (for example: Howler.js, or a lightweight HTML5-based player).
    - Must support playing local audio files served by the backend (e.g. via HTTP).
    - Must work correctly behind a reverse proxy (use relative URLs for audio file sources).
  - Features:
    - Play / Pause / Stop
    - Next / Previous track
    - Seek within track
    - Show current track info (track name, artist, album, playlist name)
    - Optional: Repeat and Shuffle (if not too complex)

- **Ad-hoc playlist from tracks list**
  - On the **Local Tracks** page:
    - Allow users to create an **ad-hoc (temporary) playback queue**:
      - User can select any tracks (multi-select) and add them to a “Current Queue”.
      - This queue is not stored permanently in the database (or can be a special non-persistent playlist).
    - Provide a button to “Play Selected” or “Play Queue”.
    - The Audio Player should be able to play this ad-hoc list similarly to a saved playlist.
  - Edge cases:
    - If a track in the queue is not downloaded yet or has a missing audio file:
      - Skip it and go to the next track.
      - Show an indication that the track is not playable.

- **Serving audio files**
  - The backend must be able to serve the downloaded audio files over HTTP.
  - Use relative paths (no hard-coded domain) so that it works behind a reverse proxy.
  - Consider file not found:
    - If the file path in the database does not exist, handle gracefully (return 404; update track status if appropriate).

---

# Out of scope

- Authentication / authorization to Web UI (single user only; no login system).
- User management, multi-user profiles.
- Advanced tagging or metadata editing beyond basic fields and status.
- Streaming directly from Spotify or YouTube (only local file playback is required).
