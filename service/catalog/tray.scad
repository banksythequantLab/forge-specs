// Forge catalog: open tray / bin with rounded corners
inner_l = 80;   // inner length (mm)
inner_w = 50;   // inner width (mm)
inner_h = 25;   // inner height (mm)
wall    = 2;    // wall thickness (mm)
floor_t = 2;    // floor thickness (mm)
radius  = 6;    // corner radius (mm)
$fn = 48;

module rbox(l, w, h, r) {
    linear_extrude(height = h) offset(r = r) offset(delta = -r) square([l, w]);
}
difference() {
    rbox(inner_l + 2*wall, inner_w + 2*wall, inner_h + floor_t, radius);
    translate([wall, wall, floor_t]) rbox(inner_l, inner_w, inner_h + 1, max(radius - wall, 0.5));
}
