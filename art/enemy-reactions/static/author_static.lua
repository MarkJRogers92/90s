local base=app.params['base'] or './'
local src=app.open(base..'static-idle.png').cels[1].image
local names={'thigh-left','thigh-right','red-shirt','arm-left','arm-right','CRT-core','shin-left','shin-right','loose-cable','broken-casing-panel'}
local dirs={'south','southwest','west','northwest','north','northeast','east','southeast'}
local piv={{40,63},{54,63},{47,53},{47,53},{47,53},{46,25},{38,76},{56,76},{47,53},{57,14}}
local zero={};for i=1,10 do zero[i]={0,0,0} end
local recoil={{0,0,0},{0,0,0},{-8,-2,0},{-8,-2,0},{-8,-2,0},{10,-2,0},{0,0,0},{0,0,0},{-13,0,0},{10,-2,0}}
local broken={{-24,1,8},{25,-1,7},{13,2,8},{13,2,8},{13,2,8},{27,4,9},{28,3,0},{-28,-2,0},{20,2,9},{42,11,5}}
local function mix(a,b,t) local r={} for i=1,10 do r[i]={} for k=1,3 do r[i][k]=a[i][k]+(b[i][k]-a[i][k])*t end end return r end
local function head(x,y,d,r,g,b)
 if d==0 then return y<=27 and x>=29 and x<=57 end
 if d==1 then return y<=27 and x>=25 and x<=58 and not(r>g*1.6 and r>b*1.6) end
 if d==2 then return y<=25 and x>=30 and x<=(y<=16 and 58 or 64-y) end
 if d==3 then return y<=24 and x>=33 and x<=67 and not(r>g*1.6 and r>b*1.6) end
 return y<=19 and x>=34 and x<=61 and not(r>g*1.6 and r>b*1.6)
end
local function part(x,y,d,v)
 local r,g,b=app.pixelColor.rgbaR(v),app.pixelColor.rgbaG(v),app.pixelColor.rgbaB(v)
 if head(x,y,d,r,g,b) then if x>=(d==0 and 53 or 55) and y>=6 and y<=22 then return 10 end return 6 end
 if d>=2 and y>23 and y<84 and r>115 and g>85 and b<65 and r>g*.8 then return 9 end
 -- Anatomical lower arm / connector tips precede knee and shoe masks.
 if y>=40 and y<=82 then
  if d==0 then if x<=20 and y<=78 then return 4 end;if x>=67 and y<=65 then return 5 end end
  if d==1 then if x<=25 and y<=74 then return 4 end;if x>=60 and y<=66 then return 5 end end
  if d==2 and x<32 and y<=75 then return 4 end
  if d==3 and ((x<=30 and y<=66) or (x<=26 and y<=75)) then return 4 end
  if d==4 then if x<=26 and y<=66 then return 4 end;if x>=71 and y<=75 then return 5 end end
 end
 if d==0 and y>=61 and y<=79 and x>=39 and x<=50 then return 9 end
 if y>=77 then return x<47 and 7 or 8 end
 if y>=64 then
  if x<17 then return 4 end;if x>73 then return 5 end
  return x<47 and 1 or 2
 end
 if d==2 then if y>31 and x<49 then return 4 end; return 3 end
 if d==3 then if x<38 then return 4 end;if x>60 then return 5 end;return 3 end
 if x<33 then return 4 end;if x>61 then return 5 end;return 3
end
local function bounds(im) local a,b,c,d=999,999,-999,-999;for y=0,95 do for x=0,95 do if app.pixelColor.rgbaA(im:getPixel(x,y))>0 then a=math.min(a,x);b=math.min(b,y);c=math.max(c,x);d=math.max(d,y) end end end;return a,b,c,d end
local function transformedBounds(im,t,p) local a,b,c,d=999,999,-999,-999;local co,si=math.cos(math.rad(t[1])),math.sin(math.rad(t[1]));for y=0,95 do for x=0,95 do if app.pixelColor.rgbaA(im:getPixel(x,y))>0 then local xx=co*(x-p[1])-si*(y-p[2])+p[1]+t[2];local yy=si*(x-p[1])+co*(y-p[2])+p[2]+t[3];a=math.min(a,xx);b=math.min(b,yy);c=math.max(c,xx);d=math.max(d,yy) end end end;return a,b,c,d end
local function renderPiece(piece,t,p,mirror,dark,dir,chip)
 local im=Image(96,96,ColorMode.RGB);local co,si=math.cos(math.rad(t[1])),math.sin(math.rad(t[1]))
 for y=0,95 do for x=0,95 do local dx,dy=x-p[1]-t[2],y-p[2]-t[3];local sx,sy=math.floor(co*dx+si*dy+p[1]+.5),math.floor(-si*dx+co*dy+p[2]+.5)
 if sx>=0 and sx<96 and sy>=0 and sy<96 then local v=piece:getPixel(sx,sy)
 if dark and app.pixelColor.rgbaA(v)>0 then
 local screen=(dir==0 and sx>=34 and sx<=52 and sy>=10 and sy<=23) or (dir==1 and sx>=29 and sx<=44 and sy>=10 and sy<=23)
 if (app.pixelColor.rgbaR(v)<110 and app.pixelColor.rgbaG(v)>100 and app.pixelColor.rgbaB(v)>95) then v=app.pixelColor.rgba(26,44,45,255) end
 if screen then v=app.pixelColor.rgba(14,23,26,255);if sx==39+math.floor((sy-10)/4) then v=app.pixelColor.rgba(49,65,64,255) end end
 end
 if app.pixelColor.rgbaA(v)>0 then im:putPixel(mirror and 95-x or x,y,v) end end end end;return im
end
local function cleanFragments(im,threshold)
 local seen={};for y=0,95 do for x=0,95 do local id=y*96+x
 if not seen[id] and app.pixelColor.rgbaA(im:getPixel(x,y))>0 then
 local q={{x,y}};seen[id]=true;local j=1;local minx,maxx,miny,maxy=x,x,y,y
 while j<=#q do local pt=q[j];j=j+1;minx=math.min(minx,pt[1]);maxx=math.max(maxx,pt[1]);miny=math.min(miny,pt[2]);maxy=math.max(maxy,pt[2]);for dy=-1,1 do for dx=-1,1 do local nx,ny=pt[1]+dx,pt[2]+dy;local nid=ny*96+nx;if nx>=0 and nx<96 and ny>=0 and ny<96 and not seen[nid] and app.pixelColor.rgbaA(im:getPixel(nx,ny))>0 then seen[nid]=true;q[#q+1]={nx,ny} end end end end
 if #q<threshold or maxx==minx or maxy==miny then for _,pt in ipairs(q) do im:putPixel(pt[1],pt[2],0) end end
 end end end
end
for _,kind in ipairs({'hurt','death'}) do
 local cols=kind=='hurt' and 4 or 7;local out=Sprite(96,96,ColorMode.RGB);local layers={};for i,n in ipairs(names) do layers[i]=i==1 and out.layers[1] or out:newLayer();layers[i].name=n end
 local detail=out:newLayer();detail.name='authored casing fracture and localized discharge'
 for direction=0,7 do
 local mirror=direction>=5;local dir=mirror and 8-direction or direction;local pieces={};for p=1,10 do pieces[p]=Image(96,96,ColorMode.RGB) end
 for y=0,95 do for x=0,95 do local v=src:getPixel(direction*96+(mirror and 95-x or x),y);if app.pixelColor.rgbaA(v)>0 then pieces[part(x,y,dir,v)]:putPixel(x,y,v) end end end
 -- Regression guards for original connector pixels that must never be classified as legs.
 local guard=direction==0 and {13,68,4} or direction==1 and {18,68,4} or direction==4 and {75,68,5} or direction==5 and {21,68,4} or nil
 if guard then assert(app.pixelColor.rgbaA(pieces[guard[3]]:getPixel(guard[1],guard[2]))>0,'connector tip left its arm layer') end
 if kind=='death' then
 -- Three source-pixel overlap rows form the cloth joint cap; no synthetic anatomy or scaling.
 for y=61,63 do for x=0,95 do local v=pieces[3]:getPixel(x,y);if app.pixelColor.rgbaA(v)>0 then pieces[x<47 and 1 or 2]:putPixel(x,y,v) end end end
 for leg=1,2 do for y=74,76 do for x=0,95 do local v=pieces[leg]:getPixel(x,y);if app.pixelColor.rgbaA(v)>0 then pieces[leg+6]:putPixel(x,y,v) end end end end
 end
 local corpse=mix(zero,zero,0);local angles={-105,-70,-90,-100,-82,-70,-80,-105,-80,-105};local centers={30,44,44,37,43,78,22,31,48,88}
 for p=1,10 do corpse[p][1]=angles[p];local a,b,c,d=transformedBounds(pieces[p],corpse[p],piv[p]);if c>-999 then corpse[p][2]=centers[p]-(a+c)/2;corpse[p][3]=91-d end end
 -- Keep the shirt, sleeves, arms and cable structurally connected through the final landing.
 local ga,gb,gc,gd=999,999,-999,-999
 for _,p in ipairs({3,9}) do local a,b,c,d=transformedBounds(pieces[p],{-90,0,0},piv[p]);ga=math.min(ga,a);gb=math.min(gb,b);gc=math.max(gc,c);gd=math.max(gd,d) end
 for _,p in ipairs({3,9}) do corpse[p]={-90,43-(ga+gc)/2,91-gd} end
 for col=1,cols do
 local idx=direction*cols+col;if idx>1 then out:newEmptyFrame() end;local pose
 if kind=='hurt' then pose=mix(zero,recoil,({1,.60,-.13,0})[col]);out.frames[idx].duration=({.05,.05,.067,.067})[col]
 else pose=col==1 and mix(zero,recoil,.75) or col==2 and mix(zero,broken,.45) or col==3 and mix(zero,broken,.8) or col==4 and mix(zero,broken,1) or col==5 and mix(broken,corpse,.48) or col==6 and mix(broken,corpse,.83) or corpse;out.frames[idx].duration=.067 end
 if kind=='death' and col>=2 and col<=4 then
 -- Register each shin to its own transformed thigh knee, preserving native joint continuity.
 local function point(t,p,x,y) local co,si=math.cos(math.rad(t[1])),math.sin(math.rad(t[1]));return co*(x-p[1])-si*(y-p[2])+p[1]+t[2],si*(x-p[1])+co*(y-p[2])+p[2]+t[3] end
 for leg=1,2 do
  -- The upper trouser section remains on the torso layer; connect the lower leg at row 64.
  local sum,n=0,0;for x=0,95 do if app.pixelColor.rgbaA(pieces[leg]:getPixel(x,64))>0 then sum=sum+x;n=n+1 end end
  if n>0 then local x=sum/n;local ax,ay=point(pose[3],piv[3],x,63.5);local bx,by=point(pose[leg],piv[leg],x,63.5);pose[leg][2]=pose[leg][2]+ax-bx;pose[leg][3]=pose[leg][3]+ay-by end
  local sum,n=0,0;for x=0,95 do if app.pixelColor.rgbaA(pieces[leg]:getPixel(x,76))>0 then sum=sum+x;n=n+1 end end
  if n>0 then local x=sum/n;local ax,ay=point(pose[leg],piv[leg],x,76.5);local bx,by=point(pose[leg+6],piv[leg+6],x,76.5);pose[leg+6][2]=pose[leg+6][2]+ax-bx;pose[leg+6][3]=pose[leg+6][3]+ay-by end
 end
 local floor=-999;for p=1,10 do local a,b,c,d=transformedBounds(pieces[p],pose[p],piv[p]);floor=math.max(floor,d) end
 if floor>93 then for p=1,10 do pose[p][3]=pose[p][3]+93-floor end end
 end
 for p=1,10 do
 local t=pose[p];local pivot=piv[p]
 if p==10 and (kind=='hurt' or col<=2) then t=pose[6];pivot=piv[6] end
 local a,b,c,d=transformedBounds(pieces[p],t,pivot);if c>-999 then
 -- Adjust only a segmented piece if a tilted edge exceeds the registered cell; never rescale.
 if a<1 then t[2]=t[2]+1-a end;if c>94 then t[2]=t[2]+94-c end;if b<1 then t[3]=t[3]+1-b end;if d>93 then t[3]=t[3]+93-d end
 end
 local im=renderPiece(pieces[p],t,pivot,mirror,kind=='death' and col>=3 and p==6,dir,p==10)
 if kind=='death' and col>=4 and p~=9 then cleanFragments(im,p==10 and 3 or 12) end
 out:newCel(layers[p],idx,im,Point(0,0))
 end
 if kind=='death' and col>=3 then
 local im=Image(96,96,ColorMode.RGB);local function dot(x,y,c) if x>0 and x<95 and y>0 and y<95 then im:putPixel(mirror and 95-x or x,y,c) end end
 local dark=app.pixelColor.rgba(31,27,29,255);local rim=app.pixelColor.rgba(194,165,123,255);local arc=app.pixelColor.rgba(76,173,177,255)
 local t=pose[6];local co,si=math.cos(math.rad(t[1])),math.sin(math.rad(t[1]));for i=0,6 do local x=54+(i%3==1 and -1 or 0);local y=9+i;local xx=math.floor(co*(x-46)-si*(y-25)+46+t[2]+.5);local yy=math.floor(si*(x-46)+co*(y-25)+25+t[3]+.5);dot(xx,yy,dark);dot(xx+1,yy,rim) end
 if col==3 or col==4 then for i=0,5 do dot(49+i%2,34+i+col*2,arc) end end
 if col>=5 then for _,q in ipairs({{70,91},{85,90},{61,92}}) do dot(q[1],q[2],rim);dot(q[1]+1,q[2],dark) end end
 out:newCel(detail,idx,im,Point(0,0))
 end
 end
 end
 for d=0,7 do local tag=out:newTag(d*cols+1,(d+1)*cols);tag.name=dirs[d+1]..'-'..kind end
 local sl=out:newSlice(Rectangle(0,0,96,96));sl.name='runtime-anchor-48-80.64';sl.pivot=Point(48,81)
 out:saveAs(base..'static-'..kind..'.aseprite');app.command.ExportSpriteSheet{ui=false,type=SpriteSheetType.ROWS,columns=cols,textureFilename=base..'static-'..kind..'.png',dataFilename=base..'static-'..kind..'.json'}
end
