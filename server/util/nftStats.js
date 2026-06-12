const POWER_TRAITS = new Set(["power", "pwr", "atk", "attack", "strength", "str"]);
const SKILL_TRAITS = new Set(["skill", "skills", "ability", "abilities"]);

function normalizeTraitName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function getAttributeName(attr) {
  return (
    attr?.trait_type ??
    attr?.traitType ??
    attr?.trait ??
    attr?.name ??
    attr?.key ??
    attr?.type ??
    ""
  );
}

function getAttributeValue(attr) {
  if (!attr || typeof attr !== "object") return attr;
  return attr.value ?? attr.val ?? attr.score ?? attr.level ?? attr.amount ?? "";
}

function getDirectValue(obj, names) {
  if (!obj || typeof obj !== "object") return undefined;

  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];
  }

  const wanted = new Set(names.map(normalizeTraitName));
  for (const [key, value] of Object.entries(obj)) {
    if (wanted.has(normalizeTraitName(key))) return value;
  }

  return undefined;
}

function findTrait(attributes, aliases) {
  if (!Array.isArray(attributes)) return null;
  return (
    attributes.find((attr) => aliases.has(normalizeTraitName(getAttributeName(attr)))) ||
    null
  );
}

function parseNumericStat(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);

  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object") {
    return parseNumericStat(
      value.value ?? value.score ?? value.level ?? value.power ?? value.skill
    );
  }

  return null;
}

function stringifySkill(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "object") {
    const nested = value.name ?? value.value ?? value.skill ?? value.type;
    if (nested != null) return stringifySkill(nested);
  }
  return "";
}

function getMetadataAttributes(metadata) {
  if (Array.isArray(metadata)) return metadata;
  if (Array.isArray(metadata?.attributes)) return metadata.attributes;
  if (Array.isArray(metadata?.traits)) return metadata.traits;
  if (Array.isArray(metadata?.properties?.attributes)) return metadata.properties.attributes;
  return [];
}

function computeNftStats(metadataOrAttributes = {}, options = {}) {
  const metadata = Array.isArray(metadataOrAttributes)
    ? { attributes: metadataOrAttributes }
    : metadataOrAttributes || {};
  const attributes = getMetadataAttributes(metadata);

  const powerTrait = findTrait(attributes, POWER_TRAITS);
  const skillTrait = findTrait(attributes, SKILL_TRAITS);

  const directPower = getDirectValue(metadata, ["power", "Power", "pwr", "attack", "atk"]);
  const directSkill = getDirectValue(metadata, ["skill", "Skill", "ability", "Ability"]);

  const powerRaw = directPower ?? getAttributeValue(powerTrait);
  const skillRaw = directSkill ?? getAttributeValue(skillTrait);
  const powerNumber = parseNumericStat(powerRaw);
  const skillNumber = parseNumericStat(skillRaw);

  let power = powerNumber;
  let source = powerNumber != null ? "power" : "";

  if (power == null && skillNumber != null) {
    power = skillNumber;
    source = "skill";
  }

  if (power == null && Number.isFinite(options.storedPower)) {
    power = Number(options.storedPower);
    source = "stored";
  }

  if (power == null) {
    power = attributes.length > 0 ? attributes.length : 1;
    source = "fallback";
  }

  return {
    power,
    skill: stringifySkill(skillRaw),
    skillPower: skillNumber,
    powerSource: source,
  };
}

function computeNftStatsFromAsset(asset) {
  return computeNftStats(asset?.content?.metadata || {});
}

function computeNftStatsFromDoc(doc) {
  const rawMetadata = doc?.raw?.content?.metadata || {};
  const metadata = {
    ...rawMetadata,
    attributes: getMetadataAttributes(rawMetadata).length
      ? getMetadataAttributes(rawMetadata)
      : doc?.attributes || [],
    skill: rawMetadata.skill ?? rawMetadata.Skill ?? doc?.skill,
  };

  return computeNftStats(metadata, {
    storedPower: typeof doc?.power === "number" ? doc.power : undefined,
  });
}

function computePowerFromAttributes(attributes) {
  return computeNftStats(attributes).power;
}

module.exports = {
  computeNftStats,
  computeNftStatsFromAsset,
  computeNftStatsFromDoc,
  computePowerFromAttributes,
};
