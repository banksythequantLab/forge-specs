// Forge catalog: cable clip (C-clip with a flat base for adhesive or a screw)
cable_dia = 8;    // cable diameter it holds (mm)
width     = 12;   // clip width (mm)
wall      = 2.4;  // wall thickness (mm)
base_len  = 24;   // length of the flat base (mm)
base_th   = 2;    // base thickness (mm)
opening   = 0.75; // fraction of the cable diameter left open at the top (0.5-0.9)
$fn = 64;

r_in  = cable_dia / 2 + 0.3;
r_out = r_in + wall;
cy    = base_th + r_out - 0.6;   // ring overlaps the base slightly so the union is manifold
module profile() {
    translate([-base_len/2, 0]) square([base_len, base_th]);
    difference() {
        translate([0, cy]) circle(r = r_out);
        translate([0, cy]) circle(r = r_in);
        translate([-cable_dia * opening / 2, cy]) square([cable_dia * opening, r_out + 1]);
    }
}
rotate([90, 0, 0]) linear_extrude(height = width, center = true) profile();
