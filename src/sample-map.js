(function attachSampleMap(global) {
  "use strict";

  const name = "Cedar Valley - Sample";
  const timestamp = "2026-01-01T12:00:00.000Z";
  const layers = [
    { id: "default", label: "Settlements", color: "#329879" },
    { id: "sample-farms", label: "Farms & Forestry", color: "#bb963c" },
    { id: "sample-resources", label: "Mines & Resources", color: "#b67c52" },
    { id: "sample-landmarks", label: "Landmarks", color: "#527eaf" },
    { id: "sample-travel", label: "Travel & Routes", color: "#9270b6" },
    { id: "sample-reference", label: "Survey Reference", color: "#7c8895", visible: false, locked: true },
  ];
  // Fictional world coordinates and descriptions; no personal locations or links.
  const places = [
    ["spawn", "Village Green", "spawn", 0, 68, 0, "default", "Start here. The village paths connect to the harbor, farms and northern mines."],
    ["village", "Cedar Village", "village", -360, 72, 160, "default", "Trading hall, beds and a shared storage barn beside the cedar grove."],
    ["harbor", "Lantern Harbor", "home", 440, 64, 240, "default", "Boat landing and a small supply house on the sheltered eastern shore."],
    ["wheat", "South Wheat Fields", "farm", -160, 69, 380, "sample-farms", "Terraced wheat plots with a water channel and a windmill store."],
    ["orchard", "Honey Orchard", "farm", 180, 74, 340, "sample-farms", "Apple trees, beehives and a flower meadow along the southern trail."],
    ["forestry", "Spruce Nursery", "farm", 400, 78, -40, "sample-farms", "Renewable timber plots. Leave the marked seed trees standing."],
    ["copper", "Copper Hollow", "mine", -460, 61, -80, "sample-resources", "Shallow copper workings; the entrance is below the western bluff."],
    ["iron", "North Ridge Mine", "mine", -240, 96, -380, "sample-resources", "Iron seam in the hillside. Bring torches for the lower galleries."],
    ["caves", "Dripstone Cavern", "mine", 80, 42, -320, "sample-resources", "A sheltered cave entrance with a descent to the dripstone chamber."],
    ["quarry", "East Stone Quarry", "mine", 440, 82, -360, "sample-resources", "Open stone cutting area, with a safe path along the southern edge."],
    ["camp", "Mossbank Camp", "bed", -420, 71, 400, "sample-landmarks", "A small campsite and overnight shelter near the marsh boardwalk."],
    ["bridge", "Riverstone Bridge", "ruins", 100, 66, 160, "sample-landmarks", "Restored stone crossing between the village green and the harbor road."],
    ["tower", "Pinewatch Tower", "tower", 520, 112, -160, "sample-landmarks", "An elevated lookout over the forest and quarry. Access is from the west."],
    ["portal", "North Gate Portal", "portal", -40, 73, -160, "sample-travel", "A marked travel hub where the ridge trail meets the forest path."],
    ["waystation", "Forest Waystation", "home", 300, 77, 40, "sample-travel", "A rest stop with spare tools, food and signs toward the eastern routes."],
    ["survey", "South Survey Marker", "beacon", 0, 70, 500, "sample-reference", "Hidden, locked reference point for trying layer visibility and read-only inspection."],
  ];

  function create() {
    return {
      version: 3,
      layers: layers.map(layer => ({ visible: true, locked: false, ...layer })),
      pins: places.map(([id, label, type, x, y, z, layerId, description]) => ({
        uid: `sample-${id}`, label, id: type, x, y, z, layerId, description,
        color: layers.find(layer => layer.id === layerId).color, icon: "", timestamp,
      })),
      drawings: [
        { id: "sample-harbor-road", name: "Harbor Road", type: "path", layerId: "sample-travel",
          points: [{ x: -360, z: 160 }, { x: 0, z: 0 }, { x: 100, z: 160 }, { x: 300, z: 40 }, { x: 440, z: 240 }],
          style: { color: "#329879", width: 3 } },
        { id: "sample-ridge-trail", name: "Northern Ridge Trail", type: "path", layerId: "sample-travel",
          points: [{ x: 0, z: 0 }, { x: -40, z: -160 }, { x: -240, z: -380 }, { x: 80, z: -320 }, { x: 440, z: -360 }],
          style: { color: "#9270b6", width: 2 } },
        { id: "sample-south-trail", name: "Orchard Trail", type: "path", layerId: "sample-travel",
          points: [{ x: -420, z: 400 }, { x: -160, z: 380 }, { x: 180, z: 340 }, { x: 440, z: 240 }],
          style: { color: "#bb963c", width: 2 } },
      ],
    };
  }

  function ensure(storage) {
    for (let index = 0; index < storage.length; index++) {
      if (storage.key(index)?.startsWith("map:")) return null;
    }
    storage.setItem(`map:${name}`, JSON.stringify(create()));
    return name;
  }

  function containsSample(document) {
    return document.pins?.some(pin => pin.uid === "sample-spawn") &&
      document.drawings?.some(drawing => drawing.id === "sample-harbor-road");
  }

  global.MapitMineSampleMap = Object.freeze({ name, create, ensure, containsSample });
})(typeof window !== "undefined" ? window : globalThis);
