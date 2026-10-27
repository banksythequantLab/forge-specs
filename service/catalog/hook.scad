// Forge catalog: desk-edge clamp hook (headphones, bags, cables)
// Units: mm. Z-up. Printed as designed: hook profile extruded along Y, so no overhangs beyond the lip.
edge_thickness = 25;   // thickness of the desk/shelf edge the clamp wraps (mm)
clamp_depth    = 40;   // how far the clamp reaches onto the desk top and underside (mm)
hook_width     = 28;   // width of the part along the desk edge (mm)
hook_drop      = 55;   // how far the hook arm hangs below the desk underside (mm)
hook_reach     = 30;   // how far the hook tip reaches out from the edge (mm)
wall           = 4;    // material thickness (mm)
lip            = 8;    // upturned lip at the hook tip (mm)
fit            = 0.4;  // clearance added to edge_thickness (mm)

t  = edge_thickness + fit;
// 2D profile in the XZ plane: x = outward from the desk edge (negative = under desk), z = up.
module profile() {
    // top plate on the desk
    translate([-clamp_depth, t]) square([clamp_depth + wall, wall]);
    // vertical plate at the desk edge
    translate([0, -hook_drop]) square([wall, t + 2*wall + hook_drop - wall]);
    // underside plate
    translate([-clamp_depth, -wall]) square([clamp_depth + wall, wall]);
    // hook arm: bottom of the vertical plate, reaching outward
    translate([0, -hook_drop]) square([hook_reach + wall, wall]);
    // upturned lip at the tip
    translate([hook_reach, -hook_drop]) square([wall, lip + wall]);
}
rotate([90, 0, 0]) linear_extrude(height = hook_width, center = true) profile();
