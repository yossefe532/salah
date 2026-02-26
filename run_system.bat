@echo off
chcp 65001
cls
echo ===================================================
echo       نظام إدارة الفعاليات - Event Management System
echo ===================================================
echo.
echo 1. جاري تشغيل الخادم المحلي (Local Server)...
start "Event Server" cmd /k "node server/index.js"

echo 2. جاري تشغيل واجهة النظام (Frontend)...
start "Event Client" cmd /k "npm run dev -- --host"

echo.
echo تم تشغيل النظام بنجاح!
echo يمكنك الآن فتح المتصفح على العنوان الذي سيظهر في النافذة الثانية.
echo (عادة ما يكون http://localhost:5173 أو http://IP:5173)
echo.
echo لا تغلق النوافذ السوداء لضمان استمرار عمل النظام.
echo.
pause