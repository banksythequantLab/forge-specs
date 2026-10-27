// Forge catalog: spacer / washer / standoff
outer_dia = 12;  // outer diameter (mm)
inner_dia = 4.5; // hole diameter (mm), 0 = solid
height    = 6;   // height (mm)
$fn = 72;
difference() {
    cylinder(d = outer_dia, h = height);
    if (inner_dia > 0) translate([0, 0, -1]) cylinder(d = inner_dia, h = height + 2);
}
