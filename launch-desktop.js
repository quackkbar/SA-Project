const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');

console.log('=========================================================================');
console.log('   ระบบจัดการโรงพิมพ์ ร้านวันชัยการพิมพ์ (Desktop ERP Application)');
console.log('   พัฒนาตามรายงานการวิเคราะห์และออกแบบระบบ SA (5).pdf หน้า 182-194');
console.log('=========================================================================\n');

function checkServer(callback) {
  const req = http.get('http://localhost:3000', (res) => {
    callback(true);
  });
  req.on('error', () => {
    callback(false);
  });
  req.setTimeout(1000, () => {
    req.destroy();
    callback(false);
  });
}

function openDesktopWindow() {
  console.log('[INFO] กำลังเปิดโปรแกรมในโหมด Desktop Application Window (--app mode)...');
  // Try Microsoft Edge with --app flag first, fallback to Chrome, then fallback to default browser
  const cmd = 'start msedge --app=http://localhost:3000 || start chrome --app=http://localhost:3000 || start http://localhost:3000';
  exec(cmd, { shell: 'cmd.exe' }, (err) => {
    if (err) {
      console.log('[INFO] เปิดเบราว์เซอร์ที่ http://localhost:3000');
      exec('start http://localhost:3000', { shell: 'cmd.exe' });
    } else {
      console.log('\n=========================================================================');
      console.log('   เปิดหน้าต่าง Desktop App เรียบร้อยแล้ว!');
      console.log('   สามารถทดสอบระบบและเก็บภาพหน้าจอลงรายงานวิเคราะห์ระบบได้ทันที');
      console.log('=========================================================================\n');
    }
  });
}

checkServer((isRunning) => {
  if (isRunning) {
    console.log('[INFO] เซิร์ฟเวอร์ Next.js กำลังทำงานอยู่ที่ http://localhost:3000 แล้ว');
    openDesktopWindow();
  } else {
    console.log('[INFO] เซิร์ฟเวอร์ยังไม่ได้เริ่ม กำลังสตาร์ท Next.js Server...');
    const serverProcess = spawn('npm.cmd', ['run', 'dev'], {
      stdio: 'inherit',
      shell: true,
      detached: false,
    });

    // Poll until server is ready, then open desktop window
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      checkServer((ready) => {
        if (ready) {
          clearInterval(interval);
          openDesktopWindow();
        } else if (attempts > 30) {
          clearInterval(interval);
          console.log('[WARN] ใช้เวลารอเซิร์ฟเวอร์นานเกินไป กรุณาเปิด http://localhost:3000 ด้วยตนเอง');
        }
      });
    }, 1500);
  }
});
