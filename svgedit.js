
const CFG = {
    // max width of element preview image (in pixels)
    "prev_w": 50,
    // max height of element preview image (in pixels)
    "prev_h": 30,
    // color list item should become when element is selected
    "list_highlight_bg": "lightgray",
    // selection highlight indicator background (solid) color
    "highlight_solid_color": "white",
    // selection highlight indicator foreground (dashed) color
    "highlight_dash_color": "black",
    // selection highlight dash array
    "highlight_dasharray": "2,2",
    // selection highlight width
    "highlight_width": "1",
    // width and height (pixels) of resize handle in lower-right-hand corner of image
    "resize_size": 9,
    // color of the resize handle
    // (later: change programmatically to contrast w/background?)
    "resize_stroke": "darkgray",
    "resize_fill":   "lightgray",
    
    "default_stroke_max": 20,
    "stroke_slider_increments": 1000,
};
CFG.prev_aspect = CFG.prev_w / CFG.prev_h;

const SVG_NS = "http://www.w3.org/2000/svg";
const ADMIN_ATTR = "data-admin-idx";

const BODY = document.querySelector("body");
const IMAGE = document.getElementById("the_image");
const ELT_LIST = document.getElementById("elements");
const EDITING_ELTS = {
    /*  handle for resizing image */
    "resize_handle": document.createElementNS(SVG_NS, "rect"),
    /*  selected element highlight */
    "highlight_rect_solid": document.createElementNS(SVG_NS, "rect"),
    "highlight_rect_dash":  document.createElementNS(SVG_NS, "rect"),
    /*  handle for moving selected element */
    "move_handle": document.createElementNS(SVG_NS, "rect"),
    /*  handles for resizing selected element */
    "resize_nw": document.createElementNS(SVG_NS, "rect"),
    "resize_n":  document.createElementNS(SVG_NS, "rect"),
    "resize_w":  document.createElementNS(SVG_NS, "rect"),
    "resize_se": document.createElementNS(SVG_NS, "rect"),
    "resize_e":  document.createElementNS(SVG_NS, "rect"),
    "resize_s":  document.createElementNS(SVG_NS, "rect"),
};
/* color and stroke width <INPUT>s */
const COLORS = {
    "stroke": document.getElementById("stroke_color"),
    "stroke_none": document.getElementById("stroke_none"),
    "fill":   document.getElementById("fill_color"),
    "fill_none": document.getElementById("fill_none"),
};
const STROKE = {
    "slider": document.getElementById("stroke_slider"),
    "current": document.getElementById("stroke_current"),
    "max": document.getElementById("stroke_max"),
}

var demodeify = null;
var active = null;
var edit_func = null;

const RGB_RE = /rgb\((\d+),\s*(\d+),\s*(\d+)/

function rgb_to_hex(col_str) {
    let m = RGB_RE.exec(col_str);
    if (m.length < 4) {
        console.log(`rgb_to_hex("${col_str}"): malformed string`);
        return null;
    }
    let hvals = [];
    for (let n = 1; n < 4; n++) {
        hvals.push(parseInt(m[n], 10).toString(16).padStart(2, "0"))
    }
    return "#" + hvals.join('');
}

function get_elt_size(elt) {
    let s = window.getComputedStyle(elt, null);
    let robj = {
        "w": parseFloat(s.getPropertyValue("width")),
        "h": parseFloat(s.getPropertyValue("height"))
    }
    return robj;
}

function get_image_elt_dims(elt) {
    let ir = IMAGE.getBoundingClientRect();
    let er = elt.getBoundingClientRect();
    
    let dimobj = {
        "x": er.x - ir.x,
        "y": er.y - ir.y,
        "w": er.width,
        "h": er.height,
    }
    
    return dimobj;
}

SCALED_ATTRIBS = {
    "line": ["x1", "x2", "y1", "y2", "stroke-width"],
    "rect": ["x", "y", "width", "height", "stroke-width"],
    "ellipse": ["cx", "cy", "rx", "ry", "stroke-width"],
};
DIRECT_ATTRIBS = {
    "line": ["stroke"],
    "rect": ["stroke", "fill"],
    "ellipse": ["stroke", "fill"],
};

var ADMIN_OBJS = [];
var ADMIN_MAP = {};
var admin_idx = 0;

function gen_admin_object(elt) {
    let idx_str = admin_idx.toString();
    admin_idx = admin_idx + 1;
    elt.setAttribute(ADMIN_ATTR, idx_str);

    let prev = document.createElementNS(SVG_NS, "svg");
    prev.appendChild(document.createElementNS(SVG_NS, elt.tagName));
    let litm = document.createElement("li");
    litm.setAttribute(ADMIN_ATTR, idx_str);
    litm.appendChild(prev);
    litm.appendChild(document.createTextNode(elt.tagName));

    let aobj = {
        "elt": elt,
        "prev": prev,
        "li": litm,
    };
    ADMIN_MAP[idx_str] = aobj;
    return aobj;
}

function update_preview(aobj) {
    let s = window.getComputedStyle(IMAGE, null);
    console.log(`image dims: ${s.getPropertyValue("width")}, ${s.getPropertyValue("height")}`);
    let bigw = parseFloat(s.getPropertyValue("width"));
    let bigh = parseFloat(s.getPropertyValue("height"));
    
    let big_aspect = bigw / bigh;
    let scale_factor = null
    if (big_aspect < CFG.prev_aspect) {
        scale_factor = CFG.prev_h / bigh;
    } else {
        scale_factor = CFG.prev_w / bigw;
    }
    
    console.log(`parsed image dims ${bigw}, ${bigh}`);
    console.log(`scale factor ${scale_factor}`);
    
    let prev = aobj.prev;
    prev.style.width = `${bigw * scale_factor}px`;
    prev.style.height = `${bigh * scale_factor}px`;
    
    let elt = aobj.elt;
    let pelt = prev.querySelector("*");
    for (let a of SCALED_ATTRIBS[elt.tagName]) {
        pelt.setAttributeNS(null, a, elt.getAttributeNS(null, a) * scale_factor);
    }
    for (let a of DIRECT_ATTRIBS[elt.tagName]) {
        pelt.setAttributeNS(null, a, elt.getAttributeNS(null, a));
    }
}

function resize_to_fit_box(elt, x, y, w, h) {
    switch (elt.tagName) {
    case "line":
        elt.setAttributeNS(null, "x1", x);
        elt.setAttributeNS(null, "y1", y);
        elt.setAttributeNS(null, "x2", x + w);
        elt.setAttributeNS(null, "y2", y + h);
        break;
    case "rect":
        elt.setAttributeNS(null, "x", x);
        elt.setAttributeNS(null, "y", y);
        elt.setAttributeNS(null, "width", w);
        elt.setAttributeNS(null, "height", h);
        break;
    case "ellipse":
        let rx = w/2;
        let ry = h/2;
        elt.setAttributeNS(null, "cx", x + rx);
        elt.setAttributeNS(null, "cy", y + ry);
        elt.setAttributeNS(null, "rx", rx);
        elt.setAttributeNS(null, "ry", ry);
        break;
    default:
        console.log(`resize_to_fit_box(...) does not yet support <${elt.tagName} /> tags`);
    }
}

function update_highlight(aobj) {
    let ir = IMAGE.getBoundingClientRect();
    let er = aobj.elt.getBoundingClientRect();
    
    let x = er.x - ir.x;
    let y = er.y - ir.y;
    let hx = x + (er.width - CFG.resize_size) / 2;
    let hy = y + (er.height - CFG.resize_size) / 2;
    let fx = x + (er.width - CFG.resize_size);
    let fy = y + (er.height - CFG.resize_size);
    
    for (let hl of [EDITING_ELTS.highlight_rect_solid,
                    EDITING_ELTS.highlight_rect_dash]) {
        hl.setAttributeNS(null, "x", x);
        hl.setAttributeNS(null, "y", y);
        hl.setAttributeNS(null, "width", er.width);
        hl.setAttributeNS(null, "height", er.height);
    }
    
    EDITING_ELTS.move_handle.setAttributeNS(null, "x", hx);
    EDITING_ELTS.move_handle.setAttributeNS(null, "y", hy);
    
    EDITING_ELTS.resize_nw.setAttributeNS(null, "x", x);
    EDITING_ELTS.resize_nw.setAttributeNS(null, "y", y);
    EDITING_ELTS.resize_n.setAttributeNS(null, "x", hx);
    EDITING_ELTS.resize_n.setAttributeNS(null, "y", y);
    EDITING_ELTS.resize_w.setAttributeNS(null, "x", x);
    EDITING_ELTS.resize_w.setAttributeNS(null, "y", hy);
    EDITING_ELTS.resize_e.setAttributeNS(null, "x", fx);
    EDITING_ELTS.resize_e.setAttributeNS(null, "y", hy);
    EDITING_ELTS.resize_s.setAttributeNS(null, "x", hx);
    EDITING_ELTS.resize_s.setAttributeNS(null, "y", fy);
    EDITING_ELTS.resize_se.setAttributeNS(null, "x", fx);
    EDITING_ELTS.resize_se.setAttributeNS(null, "y", fy);
}

function update_color(evt) {
    if (!active) return;
    
    switch (this) {
    case COLORS.stroke:
        if (COLORS.stroke_none.checked == false)
            active.elt.setAttributeNS(null, "stroke", this.value);
        break;
    case COLORS.fill:
        if (COLORS.fill_none.checked == false)
            active.elt.setAttributeNS(null, "fill", this.value);
        break;
    case COLORS.stroke_none:
        if (this.checked) {
            active.elt.setAttributeNS(null, "stroke", "none");
        } else {
            active.elt.setAttributeNS(null, "stroke", COLORS.stroke.value);
        }
        break;
    case COLORS.fill_none:
        if (this.checked) {
            active.elt.setAttributeNS(null, "fill", "none");
        } else {
            active.elt.setAttributeNS(null, "fill", COLORS.fill.value);
        }
        break;
    default:
        console.log("update_color(): unrecognized this case:");
        console.log(this);
    }
    
    update_preview(active);
}

function update_stroke(evt) {
    if (!active) return;
    
    let cmax = parseFloat(STROKE.max.value);
    if (cmax == NaN) cmax = CFG.default_stroke_max;
    if (cmax <= 1) cmax = 1;
    
    let cv = parseFloat(STROKE.current.value);
    if ((cv == NaN) || (cv <= 0)) {
        let s = window.getComputedStyle(active.elt, null);
        let cv = parseFloat(s.getPropertyValue("stroke-width"));
        STROKE.current.value = cv;
    }
    
    switch (this) {
    case STROKE.slider:
        let v = STROKE.slider.valueAsNumber * cmax / CFG.stroke_slider_increments;
        STROKE.current.value = v;
        STROKE.max.value = cmax;
        active.elt.setAttributeNS(null, "stroke-width", v);
        break;
    case STROKE.current:
        active.elt.setAttributeNS(null, "stroke-width", cv);
        if (cv > cmax) cmax = cv;
        let sv = cv * CFG.stroke_slider_increments / cmax;
        STROKE.slider.value = sv;
        STROKE.max.value = cmax;
        break;
    case STROKE.max:
        if (cv > cmax) {
            cv = cmax;
            STROKE.current.value = cv;
            active.elt.setAttributeNS(null, "stroke-width", cv);
        }
        v = cv * CFG.stroke_slider_increments / cmax;
        STROKE.slider.value = v;
        break;
    default:
        console.log("update_stroke(): unrecognized this case:");
        console.log(this);
    }
    
    update_preview(aobj);
}

function start_resizing_elt(evt) {
    mode_str = null;
    // This is a somewhat hacky way to determine which resize handle is
    // being dragged.
    for (let ctrl in EDITING_ELTS) {
        if (EDITING_ELTS.hasOwnProperty(ctrl)) {
            if (this === EDITING_ELTS[ctrl]) {
                mode_str = ctrl.substr(7);
                break;
            }
        }
    }
    
    let dn = (mode_str.indexOf("n") != -1);
    let dw = (mode_str.indexOf("w") != -1);
    let de = (mode_str.indexOf("e") != -1);
    let ds = (mode_str.indexOf("s") != -1);
    
    console.log(dn, dw, de, ds);
    
    edit_func = function (evt) {
        let dims = get_image_elt_dims(active.elt)
        if (dn) {
            dims.y = dims.y + evt.movementY;
            dims.h = dims.h - evt.movementY;
        }
        if (dw) {
            dims.x = dims.x + evt.movementX;
            dims.w = dims.w - evt.movementX;
        }
        if (de) {
            dims.w = dims.w + evt.movementX;
        }
        if (ds) {
            dims.h = dims.h + evt.movementY;
        }
        
        if (dims.h < 1) dims.h = 1;
        if (dims.w < 1) dims.w = 1;
        
        resize_to_fit_box(active.elt, dims.x, dims.y, dims.w, dims.h);
        update_highlight(active);
        update_preview(active);
    }
    
    IMAGE.addEventListener("mousemove", edit_func);
    BODY.addEventListener("mouseup", stop_resizing_elt);
}
function stop_resizing_elt(evt) {
    IMAGE.removeEventListener("mousemove", edit_func);
    edit_func = null;
    BODY.removeEventListener("mouseup", stop_resizing_elt);
}

function start_moving_elt(evt) {
    edit_func = function (evt) {
        let dims = get_image_elt_dims(active.elt);
        dims.x = dims.x + evt.movementX;
        dims.y = dims.y + evt.movementY;
        
        resize_to_fit_box(active.elt, dims.x, dims.y, dims.w, dims.h);
        update_highlight(active);
    }
    
    IMAGE.addEventListener("mousemove", edit_func);
    BODY.addEventListener("mouseup", stop_moving_elt);
}
function stop_moving_elt(evt) {
    IMAGE.removeEventListener("mousemove", edit_func);
    edit_func = null;
    BODY.removeEventListener("mouseup", stop_moving_elt);
}

function update_resize_handle() {
    let dims = get_elt_size(IMAGE);
    let x = dims.w - CFG.resize_size;
    let y = dims.h - CFG.resize_size;
    EDITING_ELTS.resize_handle.setAttribute("x", x);
    EDITING_ELTS.resize_handle.setAttribute("y", y);
}

function resize_image(evt) {
    let w = IMAGE.clientWidth + evt.movementX;
    let h = IMAGE.clientHeight + evt.movementY;
    
    if (w < CFG.resize_size) w = CFG.resize_size;
    if (h < CFG.resize_size) h = CFG.resize_size;
    
    IMAGE.style.width = `${w}px`;
    IMAGE.style.height= `${h}px`;
    
    update_resize_handle();
    
    console.log(`IMAGE resized: ${w}, ${h}`);
}
function stop_resizing_image() {
    BODY.removeEventListener("mousemove", resize_image);
    BODY.removeEventListener("mouseup", stop_resizing_image);
    for (aobj of ADMIN_OBJS) update_preview(aobj);
}

function redraw_image() {
    IMAGE.innerHTML = "";
    for (let ao of ADMIN_OBJS) {
        IMAGE.appendChild(ao.elt);
    }
    
    for (let k in EDITING_ELTS) {
        if (EDITING_ELTS.hasOwnProperty(k)) IMAGE.appendChild(EDITING_ELTS[k]);
    }
}

function redraw_list() {
    ELT_LIST.innerHTML = "";
    for (let ao of ADMIN_OBJS) {
        ELT_LIST.appendChild(ao.li);
        ao.li.addEventListener("click", click_on_li);
    }
}

function click_on_li(evt) {
    let idx_str = this.getAttribute(ADMIN_ATTR);
    console.log(`admin idx: "${idx_str}"`)
    let aobj = ADMIN_MAP[idx_str];
    let do_unselect = (aobj == active);
    
    if (demodeify) demodeify();
    if (do_unselect) return;
    
    //this.removeEventListener("click", click_on_li);
    active = aobj;
    
    aobj.li.setAttribute("class", "highlighted");
    update_highlight(aobj);
    for (let ee_name of ["highlight_rect_solid", "highlight_rect_dash",
                         "resize_nw", "resize_n", "resize_w",
                         "resize_e", "resize_s", "resize_se"]) {
        EDITING_ELTS[ee_name].style.display = "inline";
    }
    
    let cstyle = window.getComputedStyle(aobj.elt, null);
    
    if (aobj.elt.hasAttributeNS(null, "stroke")) {
        let c = aobj.elt.getAttributeNS(null, "stroke");
        if (c == "none") {
            COLORS.stroke_none.checked = true;
        } else {
            COLORS.stroke_none.checked = false;
            COLORS.stroke.value = rgb_to_hex(cstyle.getPropertyValue("stroke"));
        }
    } else {
        COLORS.stroke.disabled = true;
        COLORS.stroke_none.disabled = true;
    }
    if (aobj.elt.hasAttributeNS(null, "fill")) {
        let c = aobj.elt.getAttributeNS(null, "fill");
        if (c == "none") {
            COLORS.fill_none.checked = true;
        } else {
            COLORS.fill_none.checked = false;
            COLORS.fill.value = rgb_to_hex(cstyle.getPropertyValue("fill"));
        }
    } else {
        COLORS.fill.disabled = true;
        COLORS.fill_none.disabled = true;
    }
    
    if (aobj.elt.hasAttributeNS(null, "stroke-width")) {
        let sw = parseFloat(aobj.elt.getAttributeNS(null, "stroke-width"));
        let cmax = parseFloat(STROKE.max.value);
        if (cmax == NaN) cmax = CFG.default_stroke_max;
        if (sw > cmax) cmax = sw;
        STROKE.current.value = sw;
        STROKE.max.value = cmax;
        STROKE.slider.value = sw * CFG.stroke_slider_increments / cmax;
    } else {
        for (let ctrl in STROKE) {
            if (STROKE.hasOwnProperty(ctrl)) STROKE[ctrl].disabled = true;
        }
    }
    
    demodeify = function() {
        active = null;
        aobj.li.removeAttribute("class");
        for (let ee_name of ["highlight_rect_solid", "highlight_rect_dash",
                             "resize_nw", "resize_n", "resize_w",
                             "resize_e", "resize_s", "resize_se",
                             "move_handle"]) {
            EDITING_ELTS[ee_name].style.display = "none";
        }
        for (let ctrl in COLORS) {
            if (COLORS.hasOwnProperty(ctrl)) COLORS[ctrl].disabled = false;
        }
        for (let ctrl in STROKE) {
            if (STROKE.hasOwnProperty(ctrl)) STROKE[ctrl].disabled = false;
        }
        //aobj.li.addEventListener("click", click_on_li);
    };
}



// Script "starts" for real here.

// Build actual image from hidden shadow image
for (let elt of document.getElementById("shadow_image").children) {
    let aobj = gen_admin_object(elt);
    ADMIN_OBJS.push(aobj);
}

// Set state of editing elements.

EDITING_ELTS.resize_handle.setAttributeNS(null, "stroke", CFG.resize_stroke);
EDITING_ELTS.resize_handle.setAttributeNS(null, "fill", CFG.resize_fill);
EDITING_ELTS.resize_handle.setAttributeNS(null, "width", CFG.resize_size);
EDITING_ELTS.resize_handle.setAttributeNS(null, "height", CFG.resize_size);
EDITING_ELTS.resize_handle.style.cursor = "nwse-resize";
EDITING_ELTS.resize_handle.setAttributeNS(null, "title", "Resize Image");
EDITING_ELTS.resize_handle.addEventListener("mousedown", function() {
    console.log("mousedown on resize handle");
    BODY.addEventListener("mousemove", resize_image);
    BODY.addEventListener("mouseup", stop_resizing_image);
});

EDITING_ELTS.highlight_rect_solid.setAttributeNS(null, "fill", "none");
EDITING_ELTS.highlight_rect_solid.setAttributeNS(null, "stroke", CFG.highlight_solid_color);
EDITING_ELTS.highlight_rect_solid.setAttributeNS(null, "stroke-width", CFG.highlight_width);
EDITING_ELTS.highlight_rect_dash.setAttributeNS(null, "fill", "none");
EDITING_ELTS.highlight_rect_dash.setAttributeNS(null, "stroke", CFG.highlight_dash_color);
EDITING_ELTS.highlight_rect_dash.setAttributeNS(null, "stroke-width", CFG.highlight_width);
EDITING_ELTS.highlight_rect_dash.setAttributeNS(null, "stroke-dasharray", CFG.highlight_dasharray);

EDITING_ELTS.move_handle.setAttributeNS(null, "stroke", CFG.resize_stroke);
EDITING_ELTS.move_handle.setAttributeNS(null, "fill", CFG.resize_fill);
EDITING_ELTS.move_handle.setAttributeNS(null, "width", CFG.resize_size);
EDITING_ELTS.move_handle.setAttributeNS(null, "height", CFG.resize_size);
EDITING_ELTS.move_handle.style.cursor = "move";
EDITING_ELTS.move_handle.addEventListener("mousedown", start_moving_elt);

for (let ee_name of ["resize_nw", "resize_n", "resize_w",
                     "resize_se", "resize_e", "resize_s"]) {
    let elt = EDITING_ELTS[ee_name];
    elt.setAttributeNS(null, "fill", CFG.resize_fill);
    elt.setAttributeNS(null, "stroke", CFG.resize_stroke);
    elt.setAttributeNS(null, "stroke-width", CFG.highlight_width);
    elt.setAttributeNS(null, "width", CFG.resize_size);
    elt.setAttributeNS(null, "height", CFG.resize_size);
    elt.style.display = "none";
    elt.addEventListener("mousedown", start_resizing_elt);
}
for (let ee_name of ["resize_w", "resize_e"]) EDITING_ELTS[ee_name].style.cursor = "ew-resize";
for (let ee_name of ["resize_n", "resize_s"]) EDITING_ELTS[ee_name].style.cursor = "ns-resize";
for (let ee_name of ["resize_nw", "resize_se"]) EDITING_ELTS[ee_name].style.cursor = "nwse-resize";

for (let ctrl in COLORS) {
    if (COLORS.hasOwnProperty(ctrl)) {
        COLORS[ctrl].addEventListener("input", update_color);
    }
}

STROKE.slider.max = CFG.stroke_slider_increments;
STROKE.max.value = CFG.default_stroke_max;
STROKE.slider.addEventListener("input", update_stroke);
STROKE.current.addEventListener("change", update_stroke);
STROKE.max.addEventListener("change", update_stroke);

redraw_image();
update_resize_handle();
redraw_list();

window.setTimeout(function() {
    for (let aobj of ADMIN_OBJS) { update_preview(aobj); }
}, 100);
