-- Run from the repository root so the editable source is saved beside this script.
local output_path = "docs/art/presentation-vertical-slice/sources/atrium-fountain.aseprite"

local sprite = Sprite(96, 64, ColorMode.RGB)
local image = Image(sprite.spec)
image:clear()

local c = {
  ink = Color { r = 30, g = 26, b = 22, a = 255 },
  cream = Color { r = 236, g = 209, b = 186, a = 255 },
  rose = Color { r = 181, g = 153, b = 132, a = 255 },
  terracotta = Color { r = 121, g = 100, b = 83, a = 255 },
  chrome = Color { r = 192, g = 189, b = 184, a = 255 },
  steel = Color { r = 130, g = 129, b = 129, a = 255 },
  shade = Color { r = 81, g = 80, b = 79, a = 255 },
  cyan_light = Color { r = 125, g = 232, b = 255, a = 255 },
  cyan = Color { r = 58, g = 183, b = 226, a = 255 },
  cyan_deep = Color { r = 28, g = 124, b = 171, a = 255 },
  cyan_shadow = Color { r = 16, g = 73, b = 110, a = 255 },
  lavender = Color { r = 122, g = 110, b = 169, a = 255 },
}

local function pixel(x, y, color)
  if x >= 0 and x < 96 and y >= 0 and y < 64 then
    image:drawPixel(x, y, color)
  end
end

local function span(y, left, right, color)
  for x = left, right do pixel(x, y, color) end
end

local function block(left, top, right, bottom, color)
  for y = top, bottom do span(y, left, right, color) end
end

-- Outer stepped silhouette: a low, shallow octagonal basin, centered at its
-- depth-sorting foot point on the bottom row.
local outline = {
  { 35, 36, 59 }, { 36, 30, 65 }, { 37, 25, 70 }, { 38, 21, 74 },
  { 39, 18, 77 }, { 40, 16, 79 }, { 41, 14, 81 }, { 42, 14, 81 },
  { 43, 14, 81 }, { 44, 14, 81 }, { 45, 14, 81 }, { 46, 14, 81 },
  { 47, 14, 81 }, { 48, 14, 81 }, { 49, 14, 81 }, { 50, 14, 81 },
  { 51, 14, 81 }, { 52, 14, 81 }, { 53, 14, 81 }, { 54, 14, 81 },
  { 55, 14, 81 }, { 56, 16, 79 }, { 57, 18, 77 }, { 58, 21, 74 },
  { 59, 25, 70 }, { 60, 30, 65 }, { 61, 36, 59 }, { 62, 42, 53 },
  { 63, 46, 49 },
}
for _, row in ipairs(outline) do span(row[1], row[2], row[3], c.ink) end

-- Cream and pink tiled rim/front face; a few intentional seams keep the basin
-- clean but unmistakably mall-era tiled rather than a generic oval.
local shell = {
  { 36, 36, 59 }, { 37, 30, 65 }, { 38, 25, 70 }, { 39, 21, 74 },
  { 40, 18, 77 }, { 41, 16, 79 }, { 42, 16, 79 }, { 43, 16, 79 },
  { 44, 16, 79 }, { 45, 16, 79 }, { 46, 16, 79 }, { 47, 16, 79 },
  { 48, 16, 79 }, { 49, 16, 79 }, { 50, 16, 79 }, { 51, 16, 79 },
  { 52, 16, 79 }, { 53, 16, 79 }, { 54, 16, 79 }, { 55, 16, 79 },
  { 56, 18, 77 }, { 57, 21, 74 }, { 58, 25, 70 }, { 59, 30, 65 },
  { 60, 36, 59 }, { 61, 42, 53 }, { 62, 46, 49 },
}
for _, row in ipairs(shell) do span(row[1], row[2], row[3], c.cream) end

-- Water well, outlined in dark cyan and recessed into the light rim.
local well = {
  { 39, 35, 60 }, { 40, 29, 66 }, { 41, 25, 70 }, { 42, 23, 72 },
  { 43, 22, 73 }, { 44, 22, 73 }, { 45, 22, 73 }, { 46, 22, 73 },
  { 47, 22, 73 }, { 48, 22, 73 }, { 49, 22, 73 }, { 50, 23, 72 },
  { 51, 25, 70 }, { 52, 29, 66 }, { 53, 35, 60 },
}
for _, row in ipairs(well) do span(row[1], row[2], row[3], c.cyan_shadow) end
local water = {
  { 40, 36, 59 }, { 41, 30, 65 }, { 42, 26, 69 }, { 43, 24, 71 },
  { 44, 24, 71 }, { 45, 24, 71 }, { 46, 24, 71 }, { 47, 24, 71 },
  { 48, 24, 71 }, { 49, 24, 71 }, { 50, 26, 69 }, { 51, 30, 65 },
  { 52, 36, 59 },
}
for _, row in ipairs(water) do span(row[1], row[2], row[3], c.cyan) end
span(42, 27, 36, c.cyan_light); span(43, 25, 32, c.cyan_light)
span(47, 61, 68, c.cyan_light); span(48, 64, 69, c.cyan_light)
span(49, 27, 34, c.cyan_deep); span(50, 30, 40, c.cyan_deep)
span(45, 69, 71, c.lavender); span(46, 66, 69, c.lavender)

-- Compact chrome center tiers with a small bright water plume.
block(37, 47, 58, 49, c.ink); block(39, 47, 56, 48, c.steel)
block(40, 43, 55, 46, c.ink); block(42, 43, 53, 45, c.chrome)
block(42, 39, 53, 42, c.ink); block(44, 39, 51, 41, c.steel)
block(44, 33, 51, 38, c.ink); block(45, 34, 50, 37, c.chrome)
block(46, 29, 49, 33, c.ink); block(47, 30, 48, 32, c.steel)
pixel(45, 28, c.cyan_light); block(46, 24, 49, 28, c.cyan)
block(47, 18, 48, 24, c.cyan_light); pixel(46, 17, c.cyan_light)
pixel(49, 17, c.cyan_light); pixel(45, 16, c.cyan); pixel(50, 16, c.cyan)
pixel(44, 19, c.cyan); pixel(51, 19, c.cyan)
pixel(43, 22, c.cyan_deep); pixel(52, 22, c.cyan_deep)

-- Front tile seams and restrained lavender reflection along the basin edge.
span(54, 18, 30, c.rose); span(54, 65, 77, c.rose)
span(55, 19, 31, c.terracotta); span(55, 64, 76, c.terracotta)
span(56, 22, 33, c.rose); span(56, 62, 73, c.rose)
span(57, 26, 35, c.terracotta); span(57, 60, 69, c.terracotta)
span(58, 31, 40, c.rose); span(58, 55, 64, c.rose)
span(59, 37, 44, c.terracotta); span(59, 51, 58, c.terracotta)
pixel(56, 38, c.lavender); pixel(57, 37, c.lavender); pixel(58, 36, c.lavender)
pixel(56, 57, c.lavender); pixel(57, 58, c.lavender); pixel(58, 59, c.lavender)

local layer = sprite.layers[1]
sprite:newCel(layer, 1, image, Point(0, 0))
sprite:saveAs(output_path)
sprite:close()
