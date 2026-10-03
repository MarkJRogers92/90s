local p=app.params['base'] or './'
local source=app.open(p..'static-crt-impact.png').cels[1].image
local s=Sprite(48,48,ColorMode.RGB)
for i=1,6 do if i>1 then s:newEmptyFrame() end;s.frames[i].duration=i%3==0 and .034 or .033;local im=Image(48,48,ColorMode.RGB);im:drawImage(source,Point(-(i-1)*48,0));s:newCel(s.layers[1],i,im,Point(0,0)) end
s.layers[1].name='Forge-authored CRT fragments';local tag=s:newTag(1,6);tag.name='CRT-impact';local slice=s:newSlice(Rectangle(0,0,48,48));slice.name='impact-contact';slice.pivot=Point(24,24)
s:saveAs(p..'static-crt-impact.aseprite')
app.command.ExportSpriteSheet{ui=false,type=SpriteSheetType.ROWS,columns=6,textureFilename=p..'CRT-aseprite-roundtrip.png',dataFilename=p..'CRT-aseprite-roundtrip.json'}
