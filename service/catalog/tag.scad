// Forge catalog: keychain / luggage tag with raised text
text_str = "FORGE";  // text on the tag
length   = 60;       // tag length (mm)
width    = 24;       // tag width (mm)
thick    = 3;        // base thickness (mm)
text_h   = 1.2;      // raised text height (mm)
hole_dia = 5;        // keyring hole diameter (mm)
radius   = 5;        // corner radius (mm)
$fn = 48;
difference() {
    linear_extrude(height = thick) offset(r = radius) offset(delta = -radius) square([length, width]);
    translate([radius + 1.5, width/2, -1]) cylinder(d = hole_dia, h = thick + 2);
}
translate([length/2 + hole_dia/2 + 1, width/2, thick])
    linear_extrude(height = text_h)
        resize([length - hole_dia - radius*2 - 8, 0, 0], auto = [true, true, false])
            text(text_str, size = width * 0.5, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
