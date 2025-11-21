# NEF Image Processing Fix for macOS

## ปัญหา (Problem)

เมื่ออัพโหลดไฟล์ NEF ขนาด 33MB แล้วแปลงเป็น JPG ภาพที่ได้ออกมาจะเบลอและมีคุณภาพต่ำ ภาพเป็นแตกๆ ไม่ชัดเจน

When uploading 33MB NEF files and converting to JPG, the output images are blurry, pixelated, and low quality.

## สาเหตุ (Root Cause)

1. **Configuration Issue**: ใน `convertNEFToJPG` function มีการ comment out การตั้งค่าที่สำคัญทั้งหมด (resize options และ JPEG quality)
2. **Missing Dependencies**: macOS ต้องการ libraries เพิ่มเติมสำหรับการประมวลผลไฟล์ RAW (NEF)
3. **Sharp Library**: Sharp library ไม่ได้คอมไพล์มาพร้อมกับ RAW support

## การแก้ไข (Solution)

### ขั้นตอนที่ 1: ติดตั้ง Dependencies สำหรับ macOS

```bash
# ทำให้ script ทำงานได้
chmod +x ./install-macos-raw-support.sh

# รัน installation script
./install-macos-raw-support.sh
```

หรือติดตั้งด้วยตนเอง:

```bash
# ติดตั้ง dependencies ผ่าน Homebrew
brew install libraw vips pkg-config

# Set environment variables
export CPPFLAGS="-I$(brew --prefix libraw)/include $CPPFLAGS"
export LDFLAGS="-L$(brew --prefix libraw)/lib $LDFLAGS"
export PKG_CONFIG_PATH="$(brew --prefix libraw)/lib/pkgconfig:$PKG_CONFIG_PATH"

# Rebuild Sharp พร้อม RAW support
npm install --build-from-source sharp
```

### ขั้นตอนที่ 2: ตรวจสอบการแก้ไขใน Code

ไฟล์ `services/imageService.js` ได้รับการอัพเดตแล้ว:

- ✅ เปิดใช้งาน resize options สำหรับ NEF files
- ✅ ตั้งค่า JPEG quality สูง (95%)
- ✅ ใช้ progressive JPEG
- ✅ กำหนดความกว้างสูงสุด 2048px

### ขั้นตอนที่ 3: ทดสอบการทำงาน

```bash
# สร้างโฟลเดอร์สำหรับทดสอบ (ถ้ายังไม่มี)
mkdir -p test-files

# วางไฟล์ NEF ตัวอย่างที่นี่
# cp /path/to/your/sample.nef ./test-files/sample.nef

# รัน test script
node test-nef-processing.js
```

## ผลลัพธ์ที่คาดหวัง (Expected Results)

หลังจากแก้ไขแล้ว:

- ✅ ไฟล์ NEF จะถูกแปลงเป็น JPG คุณภาพสูง
- ✅ ภาพจะมีความกว้างสูงสุด 2048px ตามที่กำหนด
- ✅ อัตราส่วนภาพจะถูกเก็บไว้
- ✅ คุณภาพ JPEG 95% ไม่มีภาพเบลอหรือแตก
- ✅ ขนาดไฟล์ที่เหมาะสมสำหรับการแสดงผลบนเว็บ

## การตรวจสอบคุณภาพ (Quality Verification)

Test script จะแสดงข้อมูล:

```
📊 Quality Assessment:
   Aspect ratio: 1.50
   Compression ratio: 15.2:1
   Expected max width: 2048px
   Actual width: 2048px
✅ Width is within expected range
```

## การแก้ปัญหา (Troubleshooting)

ถ้ายังมีปัญหา:

1. **ตรวจสอบ Homebrew**:
   ```bash
   brew --version
   ```

2. **ตรวจสอบ libraw**:
   ```bash
   brew list libraw
   ```

3. **ตรวจสอบ Sharp**:
   ```bash
   npm list sharp
   ```

4. **Rebuild ทั้งหมด**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm install --build-from-source sharp
   ```

5. **Restart server**:
   ```bash
   npm start
   ```

## ข้อมูลเพิ่มเติม (Additional Information)

- **NEF**: Nikon Electronic Format คือ RAW file format ของกล้อง Nikon
- **Sharp**: High-performance image processing library สำหรับ Node.js
- **Libraw**: Library สำหรับอ่านและประมวลผล RAW files
- **Quality Setting**: 95% เป็นค่าที่เหมาะสมสำหรับการแปลง RAW เป็น JPEG

## ติดต่อ (Contact)

ถ้ายังมีปัญหาอยู่ กรุณาตรวจสอบ:

1. Log files ใน server
2. Error messages จาก test script
3. ตรวจสอบว่าไฟล์ NEF ไม่เสียหาย
4. ลองกับไฟล์ NEF อื่นๆ