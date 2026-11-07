# Changelog

## 0.9.0 (2026-11-07)

- Static page. Chrome or Edge, one BLE companion. The app sends the trace itself, with flags for 1, 2, or 4 byte hashes, because meshcore.js 1.13.0 always sends 1 byte flags and reads the wrong SNR count. Three byte prefixes cannot be traced.
- A target is one node, or a path of repeaters. The return path is always sent: `aa, bb, cc` goes out as `aa, bb, cc, bb, aa`. A pasted path keeps hops up to the first repeated node. The same node cannot be added twice.
- Each point is how well that hop heard the previous transmitter. Solid is the way out, dashed is the way back. The hop with this radio is grey and starts hidden on a multi-hop path. Other links keep a stable color, and the same radio link is one line even when several targets include it.
- The chart does not stretch across time when a scan is stopped. A gray line marks the stop and the next start. A timeout leaves a hole in that run. A gap longer than four intervals is left out of the scale. Every successful sample is drawn. The vertical axis has 10 grid lines.
- Summary per hop: min, average, max, sample standard deviation, loss, count, and a 2 dB distribution.
- One radio, so targets in a round run one after another. The interval is the minimum time from the start of one round to the start of the next: 15s, 30s, 60s, 5 min, 10 min, 15 min. Default is 60s. A round that overruns starts the next one immediately.
- A run stops itself after the max duration: 4, 8, 12, 24, or 48 hours, default 4. Longer than 4 hours, the shortest interval is 5 minutes. Start keeps a silent loop so a background tab is not slowed to a minute. Sleep, or a phone freezing the tab, still drops Bluetooth. The duration cap, the path-depth cap, and the slower interval on a long run are so one companion does not overuse the mesh.
- Path steps, in Settings, is how many nodes the trace walks forward: 1 to 8, default 4. The return path is still appended. A longer path is cut to the setting.
- A round runs at most 10 traces. The cap is fixed. Enabled targets after the first ten stay idle until a traced one is turned off or removed.
- The footer links to https://github.com/petskratt/coreping.
- Trace now sends one round. While that ping is in flight the button reads "One ping only, Vassily".
- Contacts come from the companion, most recently heard first, with none at the bottom. Filter sits by the title. Plus adds the node to the selected path. Use route replaces that path with the contact's saved route when the hash width matches. The list shows at least ten rows when connected, and grows with the target list.
- A target is one line of name and hash pills. A comma, space, or newline turns a finished prefix into a pill. Add commits an unfinished prefix. The full path under the field is hashes only. An empty list already has a blank field.
- Names used in a trace are saved with it. A reload without the radio still shows them. Connecting again updates names the radio still has, and leaves a stored name when the node is missing or the prefix is ambiguous. A hop with no name stays as its prefix.
- Everything for this browser is in `localStorage` under `meshpath.v1`, capped at 4000 samples. The console under the chart lists completed traces newest first, plus the one in progress. The line under the description reports the same activity, including a waiting count, and stays hidden when idle.
- Targets, beside Connect, shows and hides the target and contact list. It stays inactive until a trace has been saved, because until then that list is the page. With the radio off and nothing saved, a dim sample shows two paths, three runs, and 100 traces. It is not saved.
- The × clears samples and stays active. The next click clears the targets and resets interval, hash, path steps, and max duration to 60 seconds, 2 bytes, 4 forward nodes, and 4 hours.
- Export writes CSV (summary, then one row per hop with a local timestamp) or a JSON copy of the save. The file name is the last node of each target, lowercase ASCII, for example `coreping-nova-paldiski_2026-11-07-20-46-19.csv`. Import JSON merges into the current save: the same path stays one target, a trace already stored is kept, and local interval and duration stay.
