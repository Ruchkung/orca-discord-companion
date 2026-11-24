# คู่มือ Discord Companion for Orca

ปลั๊กอินนี้แสดงห้องเสียง Discord ที่คุณอยู่ รายชื่อคนในห้อง ใครกำลังพูด และสถานะไมค์ ไว้ในแผง **Discord** ด้านข้างของ Orca คุณปิดหรือเปิดไมค์ ปรับเสียงรายคน สลับไปหน้าห้อง และดึงสายออกเป็นหน้าต่างแยกได้จากแผงนี้ โดยไม่ต้องเปิดหน้าต่าง Discord ขึ้นมา

คู่มือนี้เริ่มตั้งแต่ดาวน์โหลดจาก GitHub ใช้เวลาประมาณ 15 ถึง 20 นาที

> ปลั๊กอินยังอยู่ในช่วงทดลอง ยังไม่อยู่ใน catalog ของ Orca จึงติดตั้งแบบ development จากโฟลเดอร์

## 1. สิ่งที่ต้องมี

| สิ่งที่ต้องมี | รายละเอียด |
|---|---|
| เครื่อง | macOS หรือ Windows 10/11 |
| Orca Desktop | เวอร์ชัน 1.4.266 ขึ้นไป |
| Discord Desktop | แอปบนเครื่อง ไม่ใช่ Discord บนเว็บ และไม่ใช่รุ่น PTB หรือ Canary |
| git | สำหรับดาวน์โหลดโปรเจกต์ (หรือโหลดเป็น ZIP จากหน้า GitHub ก็ได้) |
| สิทธิ์เข้า repo | ตอนนี้ repo เป็นแบบ private ให้เจ้าของโปรเจกต์เพิ่มบัญชี GitHub ของคุณเป็น collaborator ก่อน |
| Discord application | ใช้ของเจ้าของโปรเจกต์ (แบบ A) หรือสร้างเอง (แบบ B) ดูหัวข้อ 3 |

ไม่ต้องติดตั้ง Node.js หรือรัน `npm` เพราะไฟล์ที่แผงใช้ (`panel/dist/`) build ไว้ใน repo แล้ว

## 2. ดาวน์โหลดและติดตั้งใน Orca

1. เปิด terminal แล้วดาวน์โหลดโปรเจกต์ไปไว้ที่ที่ไม่ย้ายภายหลัง

   ```sh
   git clone https://github.com/Ruchkung/orca-discord-companion.git
   cd orca-discord-companion
   ```

   Orca อ่านปลั๊กอินจากโฟลเดอร์นี้ตลอดเวลา ถ้าย้ายหรือลบโฟลเดอร์ ปลั๊กอินจะหายไป

2. โหลดปลั๊กอินเข้า Orca

   ```sh
   orca plugin dev load . --json
   ```

   Orca จะตอบ `approval_required` พร้อมรายการสิทธิ์ที่ปลั๊กอินขอ ตรวจว่ามีแค่นี้

   - trusted worker (ตัวที่คุยกับ Discord)
   - `secrets:own` (เก็บรหัสของปลั๊กอินเองแบบเข้ารหัส)
   - แผง Discord, คำสั่ง `Discord: Switch to Discord` และรายการใน status bar

3. อนุมัติด้วยคำสั่งที่ Orca พิมพ์ออกมา หน้าตาประมาณนี้ (ค่า `ap1-…` ของแต่ละเครื่องไม่เหมือนกัน)

   ```sh
   orca plugin dev load . --json --approve ap1-xxxxxxxx
   ```

4. เปิดแผง **Discord** ทางขวาของ Orca ต้องเห็นข้อความ "Connect your Discord application to show your voice room." พร้อมช่องกรอก Application ID และ Client secret

ถ้าแผงไม่ขึ้น ลอง `orca plugin dev reload .` อีกครั้ง

## 3. เตรียม Discord application

Discord อนุญาตให้ควบคุมไมค์ผ่าน RPC เฉพาะแอปที่ผ่านการอนุมัติ และผู้ทดสอบ (tester) ที่เจ้าของแอปเพิ่มไว้ แอปหนึ่งตัวเพิ่ม tester ได้สูงสุด 50 คน บัญชีที่ไม่ได้อยู่ในรายชื่อจะกด Authorize ไม่ผ่าน

### แบบ A: ใช้แอปของเจ้าของโปรเจกต์ (แนะนำ)

1. ส่ง username Discord ของคุณให้เจ้าของแอป
2. เจ้าของเพิ่มคุณที่หน้า **App Testers** ของแอปใน [Discord Developer Portal](https://discord.com/developers/applications)
3. รอรับคำเชิญจาก Discord แล้วกดยอมรับ
4. ขอ **Application ID** และ **Client Secret** จากเจ้าของแอปทางช่องทางส่วนตัว ห้ามโพสต์ในห้องแชทรวม

Client Secret ใช้แทนตัวแอปได้ ถ้าหลุดออกไป เจ้าของต้องกด Reset Secret แล้วส่งค่าใหม่ให้ทุกคน

### แบบ B: สร้างแอปของตัวเอง

ใช้เมื่อไม่อยากรอเจ้าของ หรือแอปของเจ้าของครบ 50 คนแล้ว

1. สร้าง Application ใหม่ใน [Discord Developer Portal](https://discord.com/developers/applications)
2. ไปที่ **OAuth2 → Redirects** แล้วเพิ่ม `http://localhost`
3. คัดลอก **Application ID** จากหน้า General Information
4. กด **Reset Secret** ที่หน้า OAuth2 แล้วคัดลอก Client Secret เก็บไว้ Discord แสดงค่านี้ครั้งเดียว

ปลั๊กอินไม่ใช้บอตและไม่เก็บอะไรนอกจาก ID, secret และ token ซึ่ง Orca เก็บแบบเข้ารหัส ปลั๊กอินส่ง secret ไปที่ `discord.com` เฉพาะตอนขอและต่ออายุ token เท่านั้น

## 4. เชื่อมต่อกับ Discord

1. เปิด Discord Desktop และล็อกอินด้วยบัญชีที่เป็น tester
2. ในแผง Discord ของ Orca กรอก **Application ID** และ **Client secret**
3. กด **Connect to Discord**
4. Discord จะเด้งหน้าต่างขอสิทธิ์พร้อมชื่อแอป กด **Authorize** ภายใน 2 นาที
5. แผงควรแสดง "You're not in a voice room." หรือชื่อห้องเสียงที่คุณอยู่ พร้อมสถานะไมค์

ครั้งต่อไปไม่ต้องกรอกซ้ำ ปลั๊กอินต่ออายุ token เอง

## 5. วิธีใช้แผง

**การ์ดด้านบน**

- ชื่อห้องและจำนวนคน (ตัวเลขหมุนเมื่อมีคนเข้าออก) พื้นหลังเป็นแผ่นสไลต์สีม่วงที่ขยับได้
- **ปุ่มไมค์ใหญ่:** กดเพื่อ Mute / Unmute เป็นกระจกใส ถ้าไมค์ปิดจะมีสีแดงติด ถ้าไมค์เปิดจะมีสีเขียวติด กดแล้วมีประกายแตก และ Discord ไม่ต้องเปิดหน้าต่าง
- **ปุ่มกลมซ้าย (ลูกศรเข้าประตู):** Switch to voice room เปิดหน้าต่าง Discord ที่ห้องที่คุณอยู่ ใช้ได้แม้ Discord ซ่อนอยู่ใน system tray ถ้า Discord ปิดอยู่จะเป็น Open Discord
- **ปุ่มกลมขวา (ลูกศรออกจากกรอบ):** Pop out call ดึงสายออกเป็นหน้าต่างแยก ต้องเปิดหน้าห้องเสียงใน Discord ก่อน (ดูข้อจำกัดด้านล่าง)
- ที่ status bar ด้านล่างมีรายการ Discord แสดงชื่อห้องกับจำนวนคน กดเพื่อสลับไป Discord และมีคำสั่ง `Discord: Switch to Discord` ใน command palette

**รายชื่อคนในห้อง**

- คนที่กำลังพูดมีวงแหวนเรืองแสงที่ avatar และมีดาวสีเขียววิ่งรอบแถว
- คนที่ปิดไมค์มีไอคอนไมค์ขีดฆ่าที่ avatar และสีจางลง ชื่อไม่ขยับเมื่อสถานะเปลี่ยน
- แถวของคนที่เพิ่งเข้าห้องจะเด้งเข้ามา

**ปรับเสียงรายคน**

1. กดที่ avatar ของคนที่ต้องการ แถวนั้นจะกลายเป็นแถบสีม่วงความสูงเท่าเดิม ชื่ออยู่ซ้ายและเปอร์เซ็นต์อยู่ขวา
2. ลากแถบ ปรับได้ 0 ถึง 200% (100% คือค่าปกติของ Discord) มีจุดบอกตำแหน่ง 100%
3. ปล่อยมือ ค่าจะถูกส่งไปที่ Discord
4. กด avatar ซ้ำ กด Esc หรือกดที่อื่นเพื่อกลับเป็นแถวปกติ ถ้าเสียงคนนั้นไม่ใช่ 100% จะเห็นเปอร์เซ็นต์อยู่ขวาของแถว

แถวของตัวคุณเองไม่มีแถบนี้ และ Discord จำค่าเสียงรายคนไว้เฉพาะตอนที่ Orca ยังเชื่อมต่ออยู่ ถ้าปิด Orca หรือปลั๊กอิน เสียงของทุกคนจะกลับเป็นค่าเดิมเอง

ปุ่ม **Preview styles** ที่ท้ายแผงใช้ดูหน้าตาของสถานะต่างๆ ด้วยข้อมูลจำลอง ไม่ได้ส่งอะไรไปที่ Discord

**ข้อจำกัดของ Pop out call**

- **macOS:** ต้องเปิดสิทธิ์ให้ Orca ที่ System Settings → Privacy & Security → Accessibility
- **Windows:** Discord เปิดเผยปุ่ม Pop Out ได้ก็ต่อเมื่อเริ่มด้วย `--force-renderer-accessibility` ให้ Quit Discord จากไอคอนใน system tray แล้วกด **Open Discord** ในแผง ซึ่งจะเริ่มด้วยตัวเลือกนี้ให้

## 6. ปัญหาที่พบบ่อย

| สิ่งที่เห็น | สาเหตุ | วิธีแก้ |
|---|---|---|
| กด Authorize แล้วขึ้นว่าไม่มีสิทธิ์ หรือ invalid scope | บัญชียังไม่ได้เป็น tester | ให้เจ้าของเพิ่มใน App Testers แล้วยอมรับคำเชิญ แล้วกด Connect ใหม่ |
| "Discord rejected the application ID or client secret" | ID หรือ secret ผิด หรือเจ้าของ reset secret แล้ว | ขอค่าล่าสุดแล้วกรอกใหม่ |
| "Discord did not authorize Orca" | กด Cancel หรือไม่ได้กดภายใน 2 นาที | กด Authorize in Discord ในแผงอีกครั้ง |
| "Discord did not accept the authorization" | แอปไม่มี redirect `http://localhost` | เพิ่ม redirect ใน OAuth2 แล้ว Connect ใหม่ |
| "Discord Desktop is closed" ทั้งที่ Discord เปิดอยู่ | ใช้ Discord บนเว็บ หรือรุ่น PTB/Canary | ใช้ Discord Desktop ตัวปกติ |
| ค้างที่ "Connecting to Discord Desktop…" นาน | Discord หน่วงเมื่อแอปเดียวกันเชื่อมต่อถี่ๆ เช่น reload ปลั๊กอินหลายรอบ | รอสักครู่ อาจนานถึง 30 วินาที หายเองหลังเว้นไปไม่กี่นาที |
| Pop out call ขึ้นว่า "Quit Discord from the system tray…" (Windows) | Discord เปิดมาโดยไม่มี `--force-renderer-accessibility` | Quit Discord จาก tray แล้วกด Open Discord ในแผง |
| Pop out call ขึ้นว่า "Open the call in Discord…" | Discord ไม่ได้แสดงหน้าห้องเสียง | กด Switch to voice room ก่อน แล้วค่อยกด Pop out call |
| Pop out call ไม่ทำงานบน macOS | Orca ยังไม่มีสิทธิ์ Accessibility | เปิดที่ System Settings → Privacy & Security → Accessibility |
| ปรับเสียงรายคนแล้วเสียงไม่เปลี่ยน หรือแถบเด้งกลับ | Discord ไม่รับคำสั่ง หรือมีปุ่มอื่นกำลังทำงานอยู่ | ลองอีกครั้ง ถ้ายังไม่ได้ ดูข้อความผิดพลาดในแผงและรายงานตามหัวข้อ 8 |
| ปุ่มเป็นปุ่มธรรมดา ไม่เป็นกระจก หรือฉากหลังไม่ขยับ | เครื่องหรือ GPU ไม่รองรับ WebGL2 หรือเปิดเอฟเฟกต์พร้อมกันมากเกินไป | ปลั๊กอินยังใช้งานได้ปกติ แค่ไม่มีเอฟเฟกต์ ลองเปิด Orca ใหม่ |
| ตั้งค่าลดการเคลื่อนไหวไว้ในระบบแล้วดาวไม่วิ่ง | ปลั๊กอินเคารพการตั้งค่านี้ | เป็นพฤติกรรมปกติ |

## 7. อัปเดตและถอนการติดตั้ง

**อัปเดตเป็นเวอร์ชันล่าสุด**

```sh
cd orca-discord-companion
git pull
orca plugin dev reload .
```

ถ้า Orca แจ้งว่าสิทธิ์ของปลั๊กอินเปลี่ยน ให้ตรวจรายการแล้วอนุมัติด้วยคำสั่งที่ Orca พิมพ์ออกมา (`orca plugin dev reload . --approve ap1-…`)

**ถอนการติดตั้ง**

```sh
orca plugin dev unload .
```

จากนั้นลบโฟลเดอร์ได้ ถ้าต้องการยกเลิกสิทธิ์ที่ให้ไว้กับ Discord ไปที่ User Settings ของ Discord หาเมนูแอปที่ได้รับอนุญาต (Authorized Apps) แล้วถอนแอปที่ชื่อตรงกับแอปของคุณ (ชื่อเมนูอาจต่างกันตามเวอร์ชันของ Discord)

## 8. รายงานปัญหา

เปิด issue บน GitHub ของโปรเจกต์ หรือส่งให้เจ้าของโปรเจกต์ โดยใส่

- ระบบปฏิบัติการและเวอร์ชัน เช่น Windows 11 หรือ macOS 15
- เวอร์ชัน Orca และ Discord (Discord → User Settings → ดูที่มุมล่างซ้าย)
- สิ่งที่ทำ สิ่งที่คาด และสิ่งที่เกิดจริง
- ภาพหน้าจอแผง Discord ใน Orca
- log ของปลั๊กอินจากคำสั่ง

  ```sh
  orca plugin logs local.discord-companion --json
  ```

**อย่าใส่ Client Secret หรือ token ในรายงาน** ถ้าเผลอใส่ไป ให้แจ้งเจ้าของแอปเพื่อ reset secret ทันที
