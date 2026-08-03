# Private travel imports

Raw Flighty and OurAirports CSV files belong in this directory and are ignored
by Git. Flighty exports can contain exact dates, booking references, seats,
gates, notes, and stable identifiers, so never move a raw export into `app/` or
`public/`.

To refresh the public aggregate after replacing `flighty.csv`:

```sh
npm run travel:sync
```

Then review the generated `app/data/travel.generated.json`, run the normal
project verification gate, and build/deploy the site. The sync is intentionally
not attached to `prebuild`: CI never needs the private CSV, and ordinary builds
never rewrite a tracked artifact implicitly.

The importer canonicalizes each airport pair, so repeated flights and reverse
legs render as one corridor. A corridor is marked `bidirectional` only when the
source contains at least one completed leg in each direction. Rows dated after
the sync date are excluded so future itinerary plans never enter the public
footprint.

An explicit input path is also supported:

```sh
npm run travel:sync -- /path/to/FlightyExport.csv
```

To refresh the compact IATA catalog from new OurAirports snapshots:

```sh
node scripts/build-airport-catalog.mjs /path/to/airports.csv /path/to/countries.csv ourairports-YYYY-MM-DD
```
