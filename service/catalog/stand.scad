// Forge catalog: phone / tablet stand (front lip, reclined back support, rear brace)
device_th = 10;   // device thickness incl. case (mm)
angle     = 65;   // recline angle of the back support from the table (deg)
width     = 70;   // stand width (mm)
back_h    = 90;   // length of the back support (mm)
base_d    = 90;   // base depth, front to back (mm)
wall      = 5;    // material thickness (mm)
lip       = 12;   // front lip height above the base (mm)
front     = 12;   // distance from the front edge to the lip (mm)
$fn = 32;

x0    = front + wall + device_th;              // where the back support starts
x_top = x0 + back_h * cos(angle);
y_top = wall + back_h * sin(angle);
bx    = max(base_d - wall, x0 + wall + 5);     // brace foot on the base
lb    = sqrt(pow(x_top - bx, 2) + pow(y_top - wall, 2));
phi   = atan2(y_top - wall, x_top - bx);
module profile() {
    square([max(base_d, x_top + wall), wall]);                                     // base
    translate([front, 0]) square([wall, lip + wall]);                              // front lip
    translate([x0, wall - 0.5]) rotate(-(90 - angle)) square([wall, back_h + 0.5]); // reclined back
    translate([bx, wall - 0.5]) rotate(phi) translate([0, -wall/2]) square([lb, wall]); // rear brace
}
rotate([90, 0, 0]) linear_extrude(height = width, center = true) profile();
