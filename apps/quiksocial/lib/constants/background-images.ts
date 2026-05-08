export const DEFAULT_BG = "New_light_green_background_final.webp";

export const BACKGROUND_IMAGES: string[] = [
  "New_light_green_background_final.webp",
  "Background_light_final.webp",
  "background_landscape_red.png.png",
  "city_skyline_day.png.png",
  "city_skyline_night.png.png",
  "dark_city_skyline_night.png.png",
  "dark_green_leaves_background.png.png",
  "Background_Dark_final.webp",
  "hot_air_balloons_landscape.png.png",
  "kayak_beach_topview.png.png",
  "mountain_road_landscape.png.png",
  "mountain_sunset_frame.png.png",
  "northern_lights_sky.png.png",
  "ocean_sunset_frame.png.png",
  "snow_mountain_frame.png.png",
  "starry_sky_boat.png.png",
  "storm_clouds_rain.png.png",
  "sunlight_field_flowers.png.png",
  "tropical_beach_sunset.png.png",
];

export function isAllowedBg(name: string | null | undefined): boolean {
  if (!name || name.includes("/") || name.includes("..")) return false;
  return BACKGROUND_IMAGES.includes(name);
}

export function bgSrc(name: string | null | undefined): string {
  const safe = name && isAllowedBg(name) ? name : DEFAULT_BG;
  return `/images/${encodeURIComponent(safe)}`;
}

export function bgLabel(filename: string): string {
  return filename
    .replace(/\.png\.png$/i, "")
    .replace(/\.png$/i, "")
    .replace(/\.webp$/i, "")
    .replace(/_/g, " ")
    .trim();
}
