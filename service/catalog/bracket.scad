// Forge catalog: L-bracket / shelf bracket with screw holes and optional gusset
leg_a     = 60;   // vertical leg length (mm)
leg_b     = 60;   // horizontal leg length (mm)
width     = 25;   // bracket width (mm)
thickness = 5;    // plate thickness (mm)
hole_dia  = 4.5;  // screw hole diameter (mm), 0 = no holes
holes     = 1;    // holes per leg (0, 1 or 2)
gusset    = 1;    // 1 = add a triangular gusset, 0 = none
$fn = 48;

module leg_holes(len) {
    if (hole_dia > 0 && holes > 0) {
        for (i = [1 : holes]) {
            translate([len * i / (holes + 1), 0, -1]) cylinder(d = hole_dia, h = thickness + 2);
        }
    }
}
difference() {
    union() {
        // horizontal leg along +X, lying on the bed
        cube([leg_b, width, thickness]);
        // vertical leg along +Z at x = 0
        cube([thickness, width, leg_a]);
        if (gusset == 1) {
            g = min(leg_a, leg_b) * 0.6;
            translate([0, width/2 - thickness/2, 0])
                rotate([90, 0, 0]) translate([0, 0, -thickness/2])
                linear_extrude(height = thickness) polygon([[thickness, thickness], [g, thickness], [thickness, g]]);
        }
    }
    // holes in the horizontal leg (drilled along Z)
    translate([0, width/2, 0]) leg_holes(leg_b);
    // holes in the vertical leg (drilled along X)
    translate([0, width/2, 0]) rotate([0, -90, 0]) translate([0, 0, -thickness - 1]) leg_holes_v();
}
module leg_holes_v() {
    if (hole_dia > 0 && holes > 0) {
        for (i = [1 : holes]) {
            translate([leg_a * i / (holes + 1), 0, 0]) cylinder(d = hole_dia, h = thickness + 2);
        }
    }
}
