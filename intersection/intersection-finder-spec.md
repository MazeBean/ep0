# Largest At-Grade Intersection per US State — Project Spec

Hand this file to Claude Code as the project brief (e.g. save it as `SPEC.md` in the repo and tell Claude Code to read it first).

## 1. Goal

For each of the 50 US states, find the at-grade intersection with the largest **footprint** (defined in §5) and report the coordinates of its center. Produce the top 10 candidates per state (500 total) for manual review before the final answer is picked.

## 2. Deliverables

1. `candidates.csv` — top 10 per state, one row each:
   `state, rank, center_lat, center_lon, footprint_m2, footprint_ft2, road_names, num_approaches, divided_approaches, clip_method, osm_node_ids, osm_url, google_maps_url`
2. `review.html` — interactive review page (see §8).
3. `final.csv` — one row per state (the #1 after review), same columns.
4. A per-state run log noting counts (junctions found, excluded, merged) and any data-quality warnings.

## 3. Data

- **Source:** OpenStreetMap state extracts from Geofabrik (`<state>-latest.osm.pbf`), all 50 states. Cache downloads; record the extract date in outputs.
- **Google Maps is not a data source.** Bulk extraction violates its terms. It is used only as a link in the review page for visual checking.
- **Suggested stack:** Python, `pyrosm` or `osmium` for parsing, `OSMnx` for the network graph, `GeoPandas`/`Shapely` for geometry, `folium` for the review map. Do all geometry in a projected, meter-based CRS (e.g. the state's UTM zone), never in lat/lon degrees.

## 4. Which roads and junctions count

**Road classes loaded:** `trunk`, `primary`, `secondary`, `tertiary`, `unclassified`, `residential`, plus `motorway`/`motorway_link` (loaded only so they can be used for exclusion).
**Not loaded:** `service`, `track`, `path`, `footway`, `cycleway`, parking aisles, driveways.

**Included:** All at-grade intersections, including:
- Urban arterials with curbed medians (reference example: the Lenox Rd NE intersection in Buckhead, GA, from Charlie's photo; Charlie to supply exact coordinates for use as a test case)
- Divided highways with wide grass medians (e.g. rural four-lane US routes crossed by a side road)

**Excluded:**
- Any junction cluster where any node touches `highway=motorway` or `motorway_link` (freeway interchanges).
- Grade-separated crossings. These drop out on their own because bridged roads share no node in OSM. Keep a sanity check that no junction includes ways with differing `layer` values.

## 5. Footprint definition (the metric being ranked)

**Footprint = only the paved area inside the intersection.** It excludes:
- **Crosswalks.** The crosswalk paint itself is not counted.
- **Approach lanes.** Pavement on the far side of the crosswalk or stop line, i.e. the lanes leading into or out of the intersection, is not counted.
- **Grass or landscaped medians and islands.** These never count, in any intersection type.

In plain terms, it's the paved "box" a vehicle crosses after passing the stop bar and before reaching the far crosswalk, including curb-return corners and any paved median crossover.

### 5a. Building the pavement polygon (buffer-and-union)

For every road segment near the junction:

1. **Estimate curb-to-curb width** in this priority order:
   1. The `width` tag, if present and plausible (3–60 m).
   2. Lane count × 3.6 m (12 ft). Lane count = max of `lanes` and the number of entries in `turn:lanes`, so turn-lane widening at the approach is captured.
   3. A class default if both are missing (starting values, to be tuned): trunk 14 m, primary 12 m, secondary 10 m, tertiary 8 m, residential/unclassified 7 m.
   4. For one-way carriageways (one side of a divided road), use only that carriageway's lanes.
2. **Buffer** each centerline by width/2 with a flat cap style.
3. **Union** all buffered segments in the junction area.
4. **Fill curb returns.** Apply a closing operation: buffer outward by R, then inward by R. R defaults to 9 m (about 30 ft, a typical curb-return radius) and should be configurable. This rounds the corners where approaches meet, the way real curbs do. The closing must not bridge across a median: cap R below the median gap, or apply the closing per carriageway pair.

Because only roads get buffered, grass medians stay unpaved automatically. For divided roads, the paved median crossover counts; the median itself does not.

### 5b. Clipping the polygon to the intersection box

Each approach is cut off at a clip line perpendicular to the road:

1. **Crosswalk available (preferred).** If a `highway=crossing` node, or a `footway=crossing` way, sits on the approach within 60 m of the junction, clip at the **inner edge** of that crosswalk (the edge facing the intersection center). Crosswalk depth defaults to 3 m if it's not mapped as an area, so the clip falls about 1.5 m inward from a crossing node. Record `clip_method = crosswalk`.
2. **Stop line available.** If a mapped stop line or stop position exists on the approach, clip there. Record `clip_method = stop_line`.
3. **Fallback.** Clip where the approach leaves the crossing road's pavement edge, plus an offset of 3 m (configurable). Record `clip_method = geometric`.

The footprint is the clipped polygon. Its centroid is the reported center coordinate.

## 6. Junction identification and merging

1. Find all nodes shared by 2 or more included ways (degree ≥ 3 after simplification), excluding dead ends.
2. **Merge rule (agreed):** Two junction nodes belong to the same intersection **only if they are connected by a short segment (≤ 100 m, configurable) of the same crossing road.** This joins the two halves of a divided-road crossing, where the crossing road passes through the median crossover. It does **not** merge separate intersections that are merely close together.
   - "Same crossing road" = the same `name` or `ref`; if both are missing, the same OSM way chain.
   - Apply the rule transitively. When both roads are divided, a single intersection can be 4 nodes.
3. Each merged cluster becomes one candidate intersection.
4. Flag a cluster that spans more than 250 m, or has more than 6 nodes, as `suspicious_merge` so it gets a closer look in review.

## 7. Ranking

1. Compute the footprint for every candidate in the state.
2. Sort descending.
3. Take the top 10, **enforcing at least 300 m between candidate centroids** so one large intersection can't fill several slots as fragments.
4. Write to `candidates.csv`.

## 8. QC review page (`review.html`)

- One card per candidate, grouped by state, rank 1–10.
- Satellite base layer (Esri World Imagery in folium), with the computed footprint polygon drawn semi-transparent on top, plus the junction nodes and the clip lines.
- Buttons per candidate: **Keep**, **Reject**, **Wrong shape**, with a free-text note field. Save decisions to a downloadable `review_decisions.csv`. A browser download is fine; no server needed.
- Each card links to Google Maps satellite at the centroid and to the OSM node.
- Show footprint in m² and ft², road names, clip method, and any flags.
- Target: about 10–15 seconds per candidate, so 500 candidates take roughly 1.5–2 hours.

### Feedback loop

Reject notes like "parking lot," "two intersections merged," "missed turn lanes," or "clipped too short" decide which rule gets tightened. After changing a rule, rerun only the affected states and regenerate their cards.

## 9. Validation before the full run

1. Run on Georgia only first.
2. Check that the Buckhead / Lenox Rd NE reference intersection appears with a plausible footprint. Compare the polygon against the satellite image: its edges should sit at the inner crosswalk lines.
3. Find and check one rural divided-highway crossing in Georgia. The median should be excluded and the crossover included.
4. Only then run all 50 states.

## 10. Open decisions (Charlie to settle; defaults in brackets)

- **Texas-style frontage-road crossings** under a diamond interchange: count or exclude? [Default: exclude any cluster within 150 m of a motorway node, configurable on/off. Consider running both ways.]
- **Channelized right-turn slip lanes** (the lanes that bypass the box around a raised island): they are lanes, so exclude them? [Default: exclude `*_link` ways and slip lanes separated by an island from the footprint.]
- **Roundabouts:** count? [Default: include; footprint = paved circulating roadway.]
- **DC:** include as a 51st entry? [Default: include, labeled separately.]
- **Curb-return radius R and class default widths:** tune after the Georgia pilot.
