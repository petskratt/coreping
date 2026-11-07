# Coreping

Watch MeshCore SNR and packet loss over time. Ping one node, or trace the links between repeaters, and compare the chart before and after a change: a new antenna, a filter, the height, or where the node sits.

Connect over Bluetooth LE to your companion (a T-Echo or another MeshCore radio). Chrome or Edge, on a secure page. The companion's contact list loads when the link is up.

Build each path by hand, typing or pasting hash prefixes, or pick nodes from those contacts. One prefix is a direct ping. Several are the repeaters between you and the far node.

Start a scan, let it collect, then stop before you change the setup. Start again when the change is in place. The chart keeps both sides, with a break where you stopped, so the before and after stay readable.

Max duration and path depth are limited so a scan does not overuse the mesh. A run stops after the duration you set (4 hours by default, 48 at most). A path walks 4 nodes forward unless you change it, and never more than 8. The way back is added on top of that. Once the duration is longer than 4 hours, the interval cannot be shorter than 5 minutes. Ten traces run in one round.

Export saves a capture. JSON is the whole test (paths, samples, names). CSV is the same traces as a spreadsheet. Keep a file per setup or per day. Import merges a JSON file into whatever this browser already has: the same path stays one target, a trace already stored is kept, and captures from different times or setups land on one chart.

## Running on local server

```bash
npm install
npm test
npm run dev
```

`npm run build` writes the site into `docs/`. GitHub Pages can serve that folder from the `main` branch.

## Icon

Ping by Trimanggolo Mulyo from [Noun Project](https://thenounproject.com/browse/icons/term/ping/) (CC BY 3.0).

## License

Coreping is licensed under the Apache License, Version 2.0.
