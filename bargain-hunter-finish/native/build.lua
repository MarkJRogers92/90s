-- Builds the editable 48-frame review document (rows as tags). Run in Aseprite:
-- aseprite -b --script-param root=<this folder> --script-param out=<file.aseprite> --script build.lua
local root = app.params.root
local spr = Sprite(128, 128, ColorMode.RGB)
for i = 2, 48 do spr:newEmptyFrame() end
local dur = {0.142, 0.142, 0.142, 0.141, 0.133, 0.133}
for i = 1, 48 do spr.frames[i].duration = dur[((i - 1) % 6) + 1] end
local pilot = spr.layers[1]; pilot.name = "pilot original (reference)"; pilot.isVisible = false
local final = spr:newLayer(); final.name = "finished candidate"
local guide = spr:newLayer(); guide.name = "changed pixels vs pilot (guide)"; guide.isVisible = false
for i = 0, 47 do
  spr:newCel(pilot, i + 1, Image{fromFile=root.."/cels/pilot-"..string.format("%02d", i)..".png"}, Point(0, 0))
  spr:newCel(final, i + 1, Image{fromFile=root.."/cels/final-"..string.format("%02d", i)..".png"}, Point(0, 0))
  spr:newCel(guide, i + 1, Image{fromFile=root.."/cels/changed-"..string.format("%02d", i)..".png"}, Point(0, 0))
end
local names = {"south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"}
for r = 0, 7 do local t = spr:newTag(r * 6 + 1, r * 6 + 6); t.name = names[r + 1] end
spr:saveAs(app.params.out)
