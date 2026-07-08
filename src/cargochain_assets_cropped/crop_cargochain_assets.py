from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import zipfile, json, math, os

SRC = Path('/mnt/data/a_wide_clean_flat_ui_illustration_asset_library.png')
OUT = Path('/mnt/data/cargochain_assets')
OUT.mkdir(parents=True, exist_ok=True)

img = Image.open(SRC).convert('RGBA')
W, H = img.size

# helper
manifest = []

def crop_asset(name, box, category, trim=False, pad=8):
    folder = OUT / category
    folder.mkdir(parents=True, exist_ok=True)
    x1,y1,x2,y2 = map(int, box)
    crop = img.crop((x1,y1,x2,y2))
    if trim:
        # Trim mostly-white border using alpha against near-white background.
        # Conservative threshold to avoid trimming pale illustration backgrounds too aggressively.
        bg = Image.new('RGBA', crop.size, (255,255,255,255))
        diff = ImageChops.difference(crop, bg) if False else None
    path = folder / f'{name}.png'
    crop.save(path)
    manifest.append({
        'name': name,
        'category': category,
        'file': str(path.relative_to(OUT)),
        'box': [x1,y1,x2,y2],
        'size': crop.size,
    })
    return path

# 01 Logo & Brand
crop_asset('logo_text_horizontal', (36, 82, 255, 150), '01_logo_brand')
crop_asset('logo_mark_outline_card', (28, 195, 96, 262), '01_logo_brand')
crop_asset('logo_mark_blue_card', (112, 195, 178, 262), '01_logo_brand')
crop_asset('logo_mark_dark_card', (194, 195, 260, 262), '01_logo_brand')

# 02 Illustrations
crop_asset('delivery_truck_city', (310, 70, 468, 188), '02_illustrations')
crop_asset('clipboard_route_map', (488, 67, 672, 188), '02_illustrations')
crop_asset('warehouse_inventory_boxes', (690, 67, 850, 188), '02_illustrations')
crop_asset('package_handover', (865, 66, 1017, 189), '02_illustrations')
crop_asset('worker_packing_inventory', (327, 220, 584, 337), '02_illustrations')
crop_asset('verification_laptop_user', (615, 215, 874, 337), '02_illustrations')

# 03 Icon set outlined - 7 + 8 + 8 = 23 icons
outlined = {
    'home': (1068, 98), 'marketplace': (1136, 98), 'shipments': (1212, 98), 'track': (1282, 98),
    'wallet': (1348, 98), 'profile': (1412, 98), 'logout': (1478, 98),
    'route': (1068, 198), 'box': (1124, 198), 'truck': (1180, 198), 'motorcycle': (1234, 198),
    'van': (1289, 198), 'lorry': (1350, 198), 'clock': (1414, 198), 'calendar': (1475, 198),
    'milestone': (1068, 292), 'proof': (1125, 292), 'check': (1182, 292), 'lock': (1238, 292),
    'escrow': (1292, 292), 'payment': (1353, 292), 'upload': (1424, 292), 'filter': (1480, 292),
}
for name, (cx,cy) in outlined.items():
    crop_asset(f'outline_{name}', (cx-24, cy-24, cx+24, cy+24), '03_icons_outlined')

# 04 Icon set filled - 24 icons with rounded tile
filled_centers = [
    ('home',48,438), ('marketplace',114,438), ('shipments',181,438), ('create',246,438),
    ('track',313,438), ('wallet',390,438), ('profile',456,438), ('logout',525,438),
    ('route',48,518), ('box',114,518), ('truck',181,518), ('motorcycle',246,518),
    ('van',313,518), ('lorry',390,518), ('clock',456,518), ('calendar',525,518),
    ('milestone',48,592), ('proof',114,592), ('check',181,592), ('lock',246,592),
    ('escrow',313,592), ('payment',390,592), ('upload',456,592), ('filter',525,592),
]
for name,cx,cy in filled_centers:
    crop_asset(f'filled_{name}', (cx-25, cy-25, cx+25, cy+25), '04_icons_filled')

# 05 Vehicle icons
vehicles = [
    ('vehicle_motorcycle', 645, 447, 700, 490),
    ('vehicle_van', 704, 432, 790, 489),
    ('vehicle_lorry', 810, 430, 890, 489),
    ('vehicle_truck', 918, 426, 1002, 490),
]
for name,x1,y1,x2,y2 in vehicles:
    crop_asset(name, (x1,y1,x2,y2), '05_vehicle_icons')

# 06 Status badges
badges = [
    ('badge_in_transit', (603, 559, 678, 594)),
    ('badge_awaiting_verification', (692, 559, 838, 594)),
    ('badge_pending', (848, 559, 918, 594)),
    ('badge_completed', (604, 606, 690, 640)),
    ('badge_cancelled', (705, 606, 785, 640)),
    ('badge_escrow_funded', (799, 606, 929, 640)),
]
for name,box in badges:
    crop_asset(name, box, '06_status_badges')

# 07 UI Elements
ui_elements = [
    ('button_primary', (1050, 420, 1187, 454)),
    ('button_secondary', (1203, 420, 1338, 454)),
    ('text_link', (1370, 424, 1433, 450)),
    ('chip_default', (1042, 477, 1140, 510)),
    ('chip_active', (1146, 477, 1220, 510)),
    ('chip_success', (1227, 477, 1336, 510)),
    ('chip_warning', (1347, 477, 1440, 510)),
    ('chip_danger', (1450, 477, 1515, 510)),
    ('input_field', (1043, 532, 1254, 569)),
    ('dropdown_field', (1272, 532, 1488, 569)),
    ('search_field', (1043, 596, 1254, 631)),
    ('pagination', (1271, 596, 1491, 631)),
]
for name,box in ui_elements:
    crop_asset(name, box, '07_ui_elements')

# 08 Progress & Steps
progress_components = [
    ('stepper_four_steps', (43, 712, 411, 768)),
    ('progress_bar_60', (50, 786, 259, 805)),
    ('pagination_dots_steps', (50, 814, 255, 840)),
]
for name,box in progress_components:
    crop_asset(name, box, '08_progress_steps')

# 09 Payment / Escrow Icons
payment_icons = [
    ('escrow_funded_tile', (547, 718, 606, 779)),
    ('payment_released_tile', (663, 718, 724, 779)),
    ('refund_tile', (776, 718, 837, 779)),
    ('locked_tile', (878, 718, 936, 779)),
]
for name,box in payment_icons:
    crop_asset(name, box, '09_payment_escrow_icons')

# 10 Avatars
avatars = [
    ('avatar_shipper_male', (1044, 716, 1128, 800)),
    ('avatar_shipper_female', (1150, 716, 1234, 800)),
    ('avatar_carrier_driver', (1257, 716, 1341, 800)),
    ('avatar_placeholder', (1367, 716, 1451, 800)),
]
for name,box in avatars:
    crop_asset(name, box, '10_avatars')

# 11 Backgrounds & decorative elements
backgrounds = [
    ('background_city_skyline', (36, 900, 198, 996)),
    ('background_soft_mountains', (212, 900, 365, 996)),
    ('background_clouds', (380, 900, 535, 996)),
    ('decorative_dot_grid_large', (555, 896, 704, 993)),
    ('decorative_dot_grid_small', (721, 897, 794, 948)),
    ('decorative_circle_blob', (836, 898, 980, 996)),
]
for name,box in backgrounds:
    crop_asset(name, box, '11_backgrounds_decorative')

# 12 Miscellaneous icons
misc = [
    ('success_circle', (1054, 910, 1085, 941)),
    ('blue_check_circle', (1123, 910, 1155, 941)),
    ('info_circle', (1190, 910, 1222, 941)),
    ('warning_triangle', (1253, 908, 1288, 942)),
    ('error_circle', (1320, 910, 1352, 941)),
    ('notification_bell', (1376, 909, 1408, 941)),
    ('more_horizontal', (1052, 960, 1088, 990)),
    ('more_vertical', (1122, 959, 1154, 992)),
    ('arrow_left', (1192, 960, 1225, 992)),
    ('arrow_right', (1238, 960, 1270, 992)),
    ('eye_view', (1285, 960, 1320, 992)),
    ('download', (1351, 958, 1386, 994)),
    ('document', (1423, 958, 1458, 994)),
]
for name,box in misc:
    crop_asset(name, box, '12_miscellaneous')

# Save manifest
with open(OUT / 'manifest.json', 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2)

# Copy source sprite sheet
img.save(OUT / 'source_asset_sheet.png')

# Create preview contact sheet of all generated assets
thumb_w, thumb_h = 140, 110
label_h = 34
cols = 6
rows = math.ceil(len(manifest) / cols)
preview = Image.new('RGB', (cols*thumb_w, rows*(thumb_h+label_h)), 'white')
draw = ImageDraw.Draw(preview)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 9)
    font_b = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 10)
except Exception:
    font = font_b = None

for idx, item in enumerate(manifest):
    row, col = divmod(idx, cols)
    x = col*thumb_w
    y = row*(thumb_h+label_h)
    asset = Image.open(OUT/item['file']).convert('RGBA')
    # Fit asset to thumb
    fitted = asset.copy()
    fitted.thumbnail((thumb_w-20, thumb_h-16), Image.LANCZOS)
    bx = x + (thumb_w - fitted.width)//2
    by = y + 8 + (thumb_h - 16 - fitted.height)//2
    # checker/very pale background
    draw.rounded_rectangle([x+4, y+4, x+thumb_w-4, y+thumb_h-4], radius=8, fill=(248,250,253), outline=(229,235,245))
    preview.paste(fitted, (bx,by), fitted)
    label = item['name'][:24]
    draw.text((x+7, y+thumb_h+4), label, fill=(10,23,55), font=font_b)
    cat = item['category'].split('_',1)[-1][:24]
    draw.text((x+7, y+thumb_h+18), cat, fill=(80,91,117), font=font)

preview_path = OUT / 'asset_contact_sheet_preview.png'
preview.save(preview_path)

# Zip the folder
zip_path = Path('/mnt/data/cargochain_assets_cropped.zip')
if zip_path.exists():
    zip_path.unlink()
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for p in OUT.rglob('*'):
        zf.write(p, p.relative_to(OUT.parent))
    zf.write(Path('/mnt/data/crop_cargochain_assets.py'), 'crop_cargochain_assets.py')

print(f'Created {len(manifest)} assets in {OUT}')
print(f'ZIP: {zip_path}')
print(f'Preview: {preview_path}')
