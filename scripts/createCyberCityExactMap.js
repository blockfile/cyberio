const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const publicOut = path.join(root, "public", "citymap", "map.json");
const sourceOut = path.join(root, "src", "components", "assets", "tiles", "cyber_city_designed_map.json");

const layers = [
  { name: "water", z: 0, visible: true },
  { name: "ground", z: 1, visible: true },
  { name: "roads", z: 2, visible: true },
  { name: "buildings", z: 3, visible: true },
  { name: "props", z: 4, visible: true },
  { name: "npcs_vehicles", z: 5, visible: true },
  { name: "effects_labels", z: 6, visible: true },
  { name: "collision", z: 99, visible: false },
];

const assetsheets = {
  city_buildings: "2(1).png",
  shops_props: "3(1).png",
  street_pack: "1(1).png",
  med_pack: "6(1).png",
  industrial: "tile-B-05.png",
  interior_bar: "12(1).png",
  office: "14(1).png",
  food: "20(1).png",
};

const refs = {
  city: {
    apartmentA: { x: 0, y: 0, w: 130, h: 130 },
    apartmentB: { x: 130, y: 0, w: 130, h: 130 },
    cyberCafeTower: { x: 296, y: 120, w: 112, h: 128 },
    dataCorpTower: { x: 420, y: 0, w: 105, h: 165 },
    helipadTower: { x: 520, y: 0, w: 118, h: 150 },
    officeGlass: { x: 390, y: 130, w: 80, h: 120 },
    bench: { x: 120, y: 290, w: 85, h: 25 },
    treeA: { x: 250, y: 285, w: 55, h: 95 },
    treeB: { x: 315, y: 285, w: 70, h: 95 },
    planterA: { x: 200, y: 630, w: 55, h: 65 },
    planterB: { x: 265, y: 630, w: 55, h: 65 },
    neonBillboard: { x: 500, y: 170, w: 105, h: 65 },
    dataBillboard: { x: 610, y: 170, w: 100, h: 65 },
    drone: { x: 650, y: 620, w: 95, h: 85 },
  },
  shops: {
    cyberCafe: { x: 395, y: 0, w: 170, h: 125 },
    compactShop: { x: 0, y: 0, w: 105, h: 125 },
    cyberTech: { x: 655, y: 0, w: 105, h: 40 },
    netRunner: { x: 655, y: 45, w: 105, h: 40 },
    clubNeon: { x: 655, y: 90, w: 105, h: 40 },
    ramenStall: { x: 395, y: 205, w: 95, h: 75 },
    gunsShop: { x: 500, y: 205, w: 95, h: 75 },
    weaponsShop: { x: 615, y: 165, w: 125, h: 95 },
    arcadeSign: { x: 470, y: 280, w: 80, h: 45 },
    barSign: { x: 360, y: 175, w: 50, h: 95 },
    holoColumn: { x: 665, y: 360, w: 70, h: 85 },
    vendingRed: { x: 195, y: 360, w: 45, h: 90 },
    vendingGreen: { x: 245, y: 360, w: 45, h: 90 },
    robotLarge: { x: 365, y: 455, w: 45, h: 85 },
    robotSmall: { x: 460, y: 455, w: 45, h: 80 },
    patrolBot: { x: 530, y: 455, w: 35, h: 55 },
    cyberFloor: { x: 595, y: 470, w: 80, h: 80 },
    fountain: { x: 690, y: 300, w: 75, h: 95 },
    streetLamp: { x: 295, y: 420, w: 28, h: 105 },
    trafficLight: { x: 330, y: 420, w: 25, h: 100 },
    tableSet: { x: 300, y: 230, w: 70, h: 70 },
    tinyScreen: { x: 325, y: 565, w: 35, h: 60 },
    kiosk: { x: 395, y: 340, w: 90, h: 85 },
  },
  street: {
    ramenSign: { x: 0, y: 0, w: 85, h: 45 },
    gunsSign: { x: 90, y: 0, w: 80, h: 45 },
    taxi: { x: 395, y: 70, w: 115, h: 55 },
    blackCar: { x: 580, y: 70, w: 145, h: 60 },
    policeCar: { x: 510, y: 350, w: 120, h: 60 },
    hoverCar: { x: 520, y: 90, w: 170, h: 70 },
    drone: { x: 500, y: 130, w: 75, h: 60 },
    robot: { x: 480, y: 10, w: 45, h: 70 },
  },
  med: {
    clinic: { x: 35, y: 30, w: 150, h: 115 },
    hospitalBed: { x: 330, y: 310, w: 95, h: 75 },
    scanner: { x: 390, y: 130, w: 180, h: 190 },
    medSign: { x: 0, y: 0, w: 160, h: 30 },
    medicNeon: { x: 390, y: 690, w: 95, h: 40 },
    cyberErNeon: { x: 485, y: 690, w: 110, h: 40 },
    ambulance: { x: 30, y: 650, w: 150, h: 75 },
    medicalBot: { x: 640, y: 530, w: 50, h: 70 },
  },
  industrial: {
    crates: { x: 0, y: 0, w: 155, h: 120 },
    trashPile: { x: 0, y: 120, w: 135, h: 80 },
    signA: { x: 190, y: 0, w: 95, h: 65 },
    signB: { x: 285, y: 0, w: 100, h: 65 },
    shackA: { x: 0, y: 380, w: 140, h: 105 },
    shackB: { x: 150, y: 380, w: 145, h: 100 },
    shackC: { x: 300, y: 380, w: 160, h: 110 },
    warehouse: { x: 360, y: 90, w: 135, h: 110 },
    tankYard: { x: 510, y: 20, w: 145, h: 130 },
    barrels: { x: 530, y: 230, w: 100, h: 90 },
    graffitiWall: { x: 385, y: 300, w: 190, h: 80 },
    holoAd: { x: 660, y: 395, w: 90, h: 120 },
    foodCart: { x: 560, y: 590, w: 95, h: 115 },
  },
  bar: {
    building: { x: 0, y: 380, w: 230, h: 190 },
    patio: { x: 230, y: 550, w: 160, h: 120 },
  },
};

const ground_rects = [
  { type: "concrete", x: 0, y: 0, w: 1536, h: 1024 },
  { type: "water", x: 0, y: 650, w: 355, h: 374 },
  { type: "sidewalk", x: 0, y: 0, w: 970, h: 250 },
  { type: "industrial_floor", x: 970, y: 0, w: 566, h: 250 },
  { type: "sidewalk", x: 0, y: 405, w: 680, h: 230 },
  { type: "sidewalk", x: 680, y: 405, w: 320, h: 230 },
  { type: "sidewalk", x: 1000, y: 405, w: 536, h: 230 },
  { type: "slum_floor", x: 760, y: 635, w: 776, h: 389 },
  { type: "sidewalk", x: 355, y: 705, w: 405, h: 319 },
];

const roads = [
  { name: "main_horizontal", x: 0, y: 255, w: 1536, h: 150, lanes: 4, walkable: true },
  { name: "middle_horizontal", x: 330, y: 625, w: 1206, h: 88, lanes: 2, walkable: true },
  { name: "vertical_center", x: 655, y: 0, w: 110, h: 1024, lanes: 3, walkable: true },
  { name: "vertical_right", x: 1215, y: 245, w: 100, h: 779, lanes: 2, walkable: true },
  { name: "harbor_road", x: 345, y: 705, w: 320, h: 72, lanes: 2, walkable: true },
  { name: "crosswalk_1", x: 640, y: 350, w: 135, h: 42 },
  { name: "crosswalk_2", x: 1205, y: 350, w: 120, h: 42 },
  { name: "crosswalk_3", x: 640, y: 620, w: 135, h: 44 },
  { name: "crosswalk_4", x: 330, y: 620, w: 110, h: 42 },
];

const districts = [
  { name: "CORPORATE DISTRICT", x: 260, y: 0, w: 690, h: 250, color: "#ff49e6" },
  { name: "INDUSTRIAL ZONE", x: 970, y: 0, w: 566, h: 250, color: "#ffb13b" },
  { name: "MARKET DISTRICT", x: 0, y: 405, w: 650, h: 230, color: "#00f0ff" },
  { name: "MEDICAL CENTER", x: 690, y: 405, w: 300, h: 230, color: "#25cfff" },
  { name: "RESIDENTIAL AREA", x: 1010, y: 405, w: 526, h: 230, color: "#cc54ff" },
  { name: "CYBER BAR", x: 100, y: 640, w: 390, h: 275, color: "#c44cff" },
  { name: "SLUMS", x: 770, y: 635, w: 766, h: 389, color: "#f3a936" },
];

const sprites = [];
const collisions = [
  { x: 0, y: 650, w: 350, h: 374, type: "water", name: "harbor_water" },
  { x: 0, y: 0, w: 8, h: 1024, type: "boundary", name: "left" },
  { x: 1528, y: 0, w: 8, h: 1024, type: "boundary", name: "right" },
  { x: 0, y: 0, w: 1536, h: 8, type: "boundary", name: "top" },
  { x: 0, y: 1016, w: 1536, h: 8, type: "boundary", name: "bottom" },
  { x: 0, y: 244, w: 1536, h: 10, type: "curb", name: "north_main_curb" },
  { x: 0, y: 405, w: 1536, h: 10, type: "curb", name: "south_main_curb" },
];

function blockFor(pos, name, type = "block") {
  const insetX = Math.round(pos.w * 0.08);
  const top = Math.round(pos.y + pos.h * 0.56);
  return {
    x: pos.x + insetX,
    y: top,
    w: pos.w - insetX * 2,
    h: Math.max(12, pos.y + pos.h - top),
    type,
    name,
  };
}

function add({ id, name, sheet, src, pos, layer = "props", blocking = false, interaction = null, tags = [] }) {
  sprites.push({ id, name, sheet, src, pos, layer, blocking, interaction, tags });
  if (blocking) collisions.push(blockFor(pos, name));
}

let id = 1;
function sid(prefix) {
  return `${prefix}${String(id++).padStart(3, "0")}`;
}

// Corporate district.
add({ id: sid("b"), name: "Cyber Cafe Tower", sheet: "city_buildings", src: refs.city.cyberCafeTower, pos: { x: 58, y: 34, w: 186, h: 210 }, layer: "buildings", blocking: true, interaction: "shop.cyber_cafe", tags: ["corporate", "shop"] });
add({ id: sid("b"), name: "Data Corp Tower", sheet: "city_buildings", src: refs.city.dataCorpTower, pos: { x: 458, y: 38, w: 178, h: 232 }, layer: "buildings", blocking: true, interaction: "building.data_corp", tags: ["corporate"] });
add({ id: sid("b"), name: "Helipad Corporate Tower", sheet: "city_buildings", src: refs.city.helipadTower, pos: { x: 700, y: 30, w: 176, h: 238 }, layer: "buildings", blocking: true, tags: ["corporate"] });
add({ id: sid("b"), name: "Glass Office Annex", sheet: "city_buildings", src: refs.city.officeGlass, pos: { x: 320, y: 75, w: 126, h: 168 }, layer: "buildings", blocking: true, tags: ["corporate"] });
add({ id: sid("p"), name: "Corporate Neon Billboard", sheet: "city_buildings", src: refs.city.neonBillboard, pos: { x: 405, y: 28, w: 122, h: 70 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Data Corp Sign", sheet: "city_buildings", src: refs.city.dataBillboard, pos: { x: 545, y: 165, w: 116, h: 70 }, layer: "props", blocking: false, tags: ["sign"] });

// Industrial zone.
add({ id: sid("b"), name: "Industrial Warehouse", sheet: "industrial", src: refs.industrial.warehouse, pos: { x: 1005, y: 78, w: 198, h: 145 }, layer: "buildings", blocking: true, tags: ["industrial"] });
add({ id: sid("b"), name: "Tank Yard", sheet: "industrial", src: refs.industrial.tankYard, pos: { x: 1268, y: 50, w: 220, h: 168 }, layer: "buildings", blocking: true, tags: ["industrial"] });
add({ id: sid("p"), name: "Industrial Crate Stack", sheet: "industrial", src: refs.industrial.crates, pos: { x: 1095, y: 16, w: 190, h: 145 }, layer: "props", blocking: true, tags: ["industrial"] });
add({ id: sid("p"), name: "Industrial Barrels", sheet: "industrial", src: refs.industrial.barrels, pos: { x: 1375, y: 190, w: 110, h: 92 }, layer: "props", blocking: true, tags: ["industrial"] });
add({ id: sid("p"), name: "Warning Sign", sheet: "industrial", src: refs.industrial.signA, pos: { x: 980, y: 24, w: 105, h: 68 }, layer: "props", blocking: false, tags: ["sign"] });

// Market district.
add({ id: sid("b"), name: "Ramen Shop", sheet: "shops_props", src: refs.shops.ramenStall, pos: { x: 78, y: 448, w: 158, h: 114 }, layer: "buildings", blocking: true, interaction: "shop.ramen", tags: ["market", "food"] });
add({ id: sid("b"), name: "Gun Shop", sheet: "shops_props", src: refs.shops.gunsShop, pos: { x: 270, y: 442, w: 158, h: 116 }, layer: "buildings", blocking: true, interaction: "shop.weapons", tags: ["market", "restricted"] });
add({ id: sid("b"), name: "Market Tech Shop", sheet: "shops_props", src: refs.shops.compactShop, pos: { x: 462, y: 438, w: 150, h: 122 }, layer: "buildings", blocking: true, interaction: "shop.market_tech", tags: ["market", "shop"] });
add({ id: sid("p"), name: "Ramen Neon Sign", sheet: "street_pack", src: refs.street.ramenSign, pos: { x: 92, y: 417, w: 122, h: 56 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Guns Neon Sign", sheet: "street_pack", src: refs.street.gunsSign, pos: { x: 288, y: 417, w: 115, h: 56 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Market Bench", sheet: "city_buildings", src: refs.city.bench, pos: { x: 430, y: 560, w: 104, h: 34 }, layer: "props", blocking: true, tags: ["street"] });
add({ id: sid("p"), name: "Market Hologram", sheet: "shops_props", src: refs.shops.holoColumn, pos: { x: 515, y: 545, w: 72, h: 90 }, layer: "props", blocking: true, tags: ["hologram"] });

// Medical center.
add({ id: sid("b"), name: "Cybermed Clinic", sheet: "med_pack", src: refs.med.clinic, pos: { x: 706, y: 430, w: 218, h: 154 }, layer: "buildings", blocking: true, interaction: "facility.clinic", tags: ["medical"] });
add({ id: sid("p"), name: "Medical Holo Scanner", sheet: "med_pack", src: refs.med.scanner, pos: { x: 775, y: 405, w: 170, h: 132 }, layer: "props", blocking: true, tags: ["medical", "hologram"] });
add({ id: sid("p"), name: "Medic Neon", sheet: "med_pack", src: refs.med.medicNeon, pos: { x: 710, y: 390, w: 115, h: 48 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Cyber ER Neon", sheet: "med_pack", src: refs.med.cyberErNeon, pos: { x: 825, y: 390, w: 130, h: 48 }, layer: "props", blocking: false, tags: ["sign"] });

// Residential area.
add({ id: sid("b"), name: "Residential Block A", sheet: "city_buildings", src: refs.city.apartmentA, pos: { x: 1035, y: 422, w: 214, h: 164 }, layer: "buildings", blocking: true, tags: ["residential"] });
add({ id: sid("b"), name: "Residential Block B", sheet: "city_buildings", src: refs.city.apartmentB, pos: { x: 1262, y: 422, w: 214, h: 164 }, layer: "buildings", blocking: true, tags: ["residential"] });
add({ id: sid("p"), name: "Apartment Neon", sheet: "shops_props", src: refs.shops.clubNeon, pos: { x: 1174, y: 393, w: 106, h: 44 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Residential Plant", sheet: "city_buildings", src: refs.city.planterA, pos: { x: 1375, y: 585, w: 62, h: 74 }, layer: "props", blocking: true, tags: ["plant"] });

// Harbor and Cyber Bar.
add({ id: sid("b"), name: "Cyber Bar", sheet: "interior_bar", src: refs.bar.building, pos: { x: 118, y: 654, w: 270, h: 215 }, layer: "buildings", blocking: true, interaction: "shop.bar", tags: ["bar", "nightlife"] });
add({ id: sid("p"), name: "Bar Patio", sheet: "interior_bar", src: refs.bar.patio, pos: { x: 390, y: 665, w: 190, h: 140 }, layer: "props", blocking: true, tags: ["bar"] });
add({ id: sid("p"), name: "Harbor Bench", sheet: "city_buildings", src: refs.city.bench, pos: { x: 405, y: 810, w: 104, h: 34 }, layer: "props", blocking: true, tags: ["street"] });
add({ id: sid("p"), name: "Harbor Planter", sheet: "city_buildings", src: refs.city.planterB, pos: { x: 505, y: 615, w: 70, h: 78 }, layer: "props", blocking: true, tags: ["plant"] });

// Slums.
add({ id: sid("b"), name: "Slum Shack A", sheet: "industrial", src: refs.industrial.shackA, pos: { x: 782, y: 700, w: 190, h: 142 }, layer: "buildings", blocking: true, tags: ["slums"] });
add({ id: sid("b"), name: "Slum Shack B", sheet: "industrial", src: refs.industrial.shackB, pos: { x: 990, y: 708, w: 192, h: 136 }, layer: "buildings", blocking: true, tags: ["slums"] });
add({ id: sid("b"), name: "Slum Shack C", sheet: "industrial", src: refs.industrial.shackC, pos: { x: 1190, y: 696, w: 212, h: 152 }, layer: "buildings", blocking: true, tags: ["slums"] });
add({ id: sid("b"), name: "Slum Shack D", sheet: "industrial", src: refs.industrial.shackB, pos: { x: 870, y: 850, w: 190, h: 136 }, layer: "buildings", blocking: true, tags: ["slums"] });
add({ id: sid("b"), name: "Slum Shack E", sheet: "industrial", src: refs.industrial.shackA, pos: { x: 1090, y: 850, w: 190, h: 142 }, layer: "buildings", blocking: true, tags: ["slums"] });
add({ id: sid("p"), name: "Slum Graffiti Wall", sheet: "industrial", src: refs.industrial.graffitiWall, pos: { x: 805, y: 655, w: 238, h: 96 }, layer: "props", blocking: false, tags: ["slums", "graffiti"] });
add({ id: sid("p"), name: "Slum Trash Pile", sheet: "industrial", src: refs.industrial.trashPile, pos: { x: 1020, y: 620, w: 150, h: 92 }, layer: "props", blocking: true, tags: ["slums"] });
add({ id: sid("p"), name: "Slum Food Cart", sheet: "industrial", src: refs.industrial.foodCart, pos: { x: 1340, y: 840, w: 110, h: 128 }, layer: "props", blocking: true, interaction: "shop:slum_food", tags: ["slums", "food"] });

// Street props: lamps, signs, greenery, and holograms.
[
  [300, 210], [410, 210], [920, 205], [1040, 245], [1190, 245],
  [560, 410], [650, 410], [970, 410], [1320, 410], [615, 710],
  [700, 710], [1210, 610], [1440, 610],
].forEach(([x, y]) => add({ id: sid("p"), name: "Street Lamp", sheet: "shops_props", src: refs.shops.streetLamp, pos: { x, y, w: 30, h: 112 }, layer: "props", blocking: true, tags: ["street"] }));

[
  [270, 96], [360, 204], [905, 100], [1390, 315], [1035, 600], [570, 610],
].forEach(([x, y]) => add({ id: sid("p"), name: "Street Tree", sheet: "city_buildings", src: refs.city.treeB, pos: { x, y, w: 78, h: 108 }, layer: "props", blocking: true, tags: ["plant"] }));

add({ id: sid("p"), name: "Corporate Hologram", sheet: "shops_props", src: refs.shops.fountain, pos: { x: 840, y: 165, w: 78, h: 100 }, layer: "props", blocking: true, tags: ["hologram"] });
add({ id: sid("p"), name: "Roadside Billboard A", sheet: "shops_props", src: refs.shops.cyberTech, pos: { x: 770, y: 285, w: 122, h: 46 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Roadside Billboard B", sheet: "shops_props", src: refs.shops.netRunner, pos: { x: 520, y: 610, w: 122, h: 46 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Arcade Sign", sheet: "shops_props", src: refs.shops.arcadeSign, pos: { x: 450, y: 395, w: 96, h: 52 }, layer: "props", blocking: false, tags: ["sign"] });
add({ id: sid("p"), name: "Industrial Hologram Ad", sheet: "industrial", src: refs.industrial.holoAd, pos: { x: 1420, y: 122, w: 86, h: 116 }, layer: "props", blocking: true, tags: ["industrial", "hologram"] });

// Vehicles and NPCs.
add({ id: sid("v"), name: "Yellow Taxi Westbound", sheet: "street_pack", src: refs.street.taxi, pos: { x: 330, y: 292, w: 130, h: 62 }, layer: "npcs_vehicles", blocking: true, tags: ["vehicle"] });
add({ id: sid("v"), name: "Yellow Taxi Eastbound", sheet: "street_pack", src: refs.street.taxi, pos: { x: 820, y: 306, w: 128, h: 60 }, layer: "npcs_vehicles", blocking: true, tags: ["vehicle"] });
add({ id: sid("v"), name: "Purple Car", sheet: "street_pack", src: refs.street.blackCar, pos: { x: 520, y: 292, w: 118, h: 52 }, layer: "npcs_vehicles", blocking: true, tags: ["vehicle"] });
add({ id: sid("v"), name: "Police Car", sheet: "street_pack", src: refs.street.policeCar, pos: { x: 1245, y: 300, w: 132, h: 66 }, layer: "npcs_vehicles", blocking: true, tags: ["vehicle", "police"] });
add({ id: sid("v"), name: "Ambulance", sheet: "med_pack", src: refs.med.ambulance, pos: { x: 845, y: 565, w: 140, h: 70 }, layer: "npcs_vehicles", blocking: true, tags: ["vehicle", "medical"] });
add({ id: sid("v"), name: "Hover Car", sheet: "street_pack", src: refs.street.hoverCar, pos: { x: 1015, y: 315, w: 170, h: 70 }, layer: "npcs_vehicles", blocking: true, tags: ["vehicle", "flying"] });
add({ id: sid("v"), name: "Drone Patrol", sheet: "street_pack", src: refs.street.drone, pos: { x: 590, y: 505, w: 72, h: 58 }, layer: "npcs_vehicles", blocking: false, tags: ["drone"] });
add({ id: sid("v"), name: "Corporate Drone", sheet: "city_buildings", src: refs.city.drone, pos: { x: 910, y: 85, w: 82, h: 72 }, layer: "npcs_vehicles", blocking: false, tags: ["drone"] });

[
  [420, 520, "Security Bot"], [480, 520, "Security Bot"], [720, 330, "Pedestrian"], [865, 490, "Medical Bot"],
  [965, 500, "Clinic Visitor"], [1140, 520, "Resident"], [1310, 520, "Resident"], [1120, 825, "Slum Contact"],
  [900, 830, "Slum Worker"], [330, 175, "Corporate Guard"], [980, 210, "Industrial Worker"],
].forEach(([x, y, name]) => {
  const med = name === "Medical Bot";
  add({
    id: sid("n"),
    name,
    sheet: med ? "med_pack" : "street_pack",
    src: med ? refs.med.medicalBot : refs.street.robot,
    pos: { x, y, w: 45, h: 70 },
    layer: "npcs_vehicles",
    blocking: true,
    interaction: name === "Slum Contact" ? "npc:slum_contact" : null,
    tags: ["npc"],
  });
});

const interactive_zones = [
  { name: "enter_cyber_cafe", x: 112, y: 210, w: 85, h: 42, action: "open_scene:cyber_cafe" },
  { name: "enter_data_corp", x: 512, y: 230, w: 80, h: 42, action: "open_scene:data_corp_lobby" },
  { name: "ramen_vendor", x: 105, y: 545, w: 105, h: 48, action: "shop:ramen" },
  { name: "weapon_shop", x: 298, y: 545, w: 96, h: 48, action: "shop:weapons" },
  { name: "clinic_reception", x: 760, y: 565, w: 110, h: 50, action: "heal_or_quest:clinic" },
  { name: "apartment_lobby", x: 1120, y: 565, w: 90, h: 50, action: "open_scene:residential_lobby" },
  { name: "cyber_bar_door", x: 198, y: 812, w: 100, h: 48, action: "open_scene:cyber_bar" },
  { name: "slum_contact", x: 1110, y: 832, w: 95, h: 62, action: "npc:slum_contact" },
  { name: "industrial_terminal", x: 1425, y: 205, w: 80, h: 70, action: "inspect:industrial_terminal" },
];

const spawn_points = [
  { name: "player_start", x: 720, y: 520, dir: "down" },
  { name: "market_spawn", x: 300, y: 520 },
  { name: "corporate_spawn", x: 600, y: 190 },
  { name: "industrial_spawn", x: 1120, y: 190 },
  { name: "residential_spawn", x: 1235, y: 560 },
  { name: "slums_spawn", x: 1010, y: 860 },
  { name: "bar_spawn", x: 310, y: 790 },
];

const paths = [
  { name: "taxi_loop", points: [[330, 320], [650, 320], [900, 320], [1250, 320], [1250, 670], [700, 670], [700, 320]] },
  { name: "corporate_patrol", points: [[330, 190], [520, 190], [760, 190], [880, 220], [600, 220]] },
  { name: "market_walk", points: [[105, 555], [300, 560], [475, 545], [590, 600], [320, 615]] },
  { name: "slum_walk", points: [[830, 825], [1020, 850], [1210, 835], [1370, 900], [1100, 920]] },
];

const map = {
  format: "cyber-city-map-v2",
  note: "Recreated from the Cyber City Tile Map Creator reference screenshot. This is a renderer-compatible sprite-placement JSON, with editor metadata for the 100x100 / 32px map shown in the reference.",
  editor: {
    title: "CYBER CITY TILE MAP CREATOR",
    map_info: {
      map_name: "Cyber City",
      width: 100,
      height: 100,
      tile_size: "32x32",
      layers: 5,
      background: "#0D0F17",
    },
    layers: ["Ground", "Buildings", "Objects", "Interactive", "Effects"],
    categories: ["Buildings", "Shops", "Facilities", "Industrial", "Decorations", "Vehicles", "NPC / Robots"],
  },
  map: {
    name: "Cyber City",
    width_px: 1536,
    height_px: 1024,
    tile_size: 32,
    grid: { width: 48, height: 32 },
  },
  assetsheets,
  layers,
  ground_rects,
  roads,
  districts,
  sprites,
  collisions,
  interactive_zones,
  spawn_points,
  paths,
};

for (const out of [publicOut, sourceOut]) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`, "utf8");
}

console.log(`Wrote ${publicOut}`);
console.log(`Wrote ${sourceOut}`);
console.log(`Sprites: ${sprites.length}`);
console.log(`Collisions: ${collisions.length}`);
