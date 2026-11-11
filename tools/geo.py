import json, math, sys
src = sys.argv[1]
g = json.load(open(src))
EAST = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23}
def rdp(pts, eps):
    if len(pts) < 3: return pts
    keep = [False]*len(pts); keep[0]=keep[-1]=True
    stack=[(0,len(pts)-1)]
    while stack:
        a,b = stack.pop()
        ax,ay = pts[a]; bx,by = pts[b]
        dx,dy = bx-ax, by-ay; L = math.hypot(dx,dy) or 1e-12
        md=0; mi=-1
        for i in range(a+1,b):
            px,py = pts[i]
            d = abs(dy*(px-ax)-dx*(py-ay))/L if L>1e-9 else math.hypot(px-ax,py-ay)
            if d>md: md=d; mi=i
        if md>eps:
            keep[mi]=True; stack.append((a,mi)); stack.append((mi,b))
    return [p for p,k in zip(pts,keep) if k]
def area(pts):
    s=0
    for i in range(len(pts)):
        x1,y1=pts[i]; x2,y2=pts[(i+1)%len(pts)]
        s+=x1*y2-x2*y1
    return abs(s)/2
def make(name, lon0, lon1, lat0, lat1, W, eps, minarea, clipbox=None):
    latm=(lat0+lat1)/2; kx=math.cos(math.radians(latm))
    k = W/((lon1-lon0)*kx); H = (lat1-lat0)*k
    def P(lon,lat): return ((lon-lon0)*kx*k, (lat1-lat)*k)
    out=[]
    for f in g['features']:
        pid=f['properties']['id']; geom=f['geometry']
        polys = geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
        d=''
        for poly in polys:
            ring=poly[0]
            lons=[c[0] for c in ring]; lats=[c[1] for c in ring]
            if max(lons)<lon0-0.3 or min(lons)>lon1+0.3 or max(lats)<lat0-0.3 or min(lats)>lat1+0.3: continue
            pts=[P(c[0],c[1]) for c in ring]
            if area(pts)<minarea: continue
            pts=rdp(pts,eps)
            if len(pts)<4: continue
            d+='M'+'L'.join('%.1f,%.1f'%p for p in pts)+'Z'
        if d: out.append({'id':pid,'n':f['properties']['nam_ja'],'e':pid in EAST,'d':d})
    return {'name':name,'W':round(W,1),'H':round(H,1),'lon0':lon0,'lat1':lat1,'kx':kx,'k':k,'p':out}
maps = {
 'east': make('east',135.3,146.2,34.4,45.7,400,0.45,3),
 'west': make('west',129.2,137.1,30.2,35.9,400,0.45,3),
 'oki':  make('oki',127.5,128.12,26.02,26.56,400,0.5,3),
}
json.dump(maps, open(sys.argv[2],'w'), ensure_ascii=False, separators=(',',':'))
for k,v in maps.items(): print(k, v['W'], v['H'], len(v['p']), sum(len(p['d']) for p in v['p']))
