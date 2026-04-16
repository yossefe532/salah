import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, normalizeGovernorate } from '../lib/api';
import { Attendee } from '../types';
import { QRCodeCanvas } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { Printer, ArrowLeft, Ticket, ScanFace, FileBadge2, Download, Settings2, Save, X, Upload } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { parseTableOrWaveFromSeatCode, parseSeatNumberFromSeatCode } from '../lib/seat-code';

const IDCard: React.FC = () => {
  const params = useParams();
  const id = params.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewMode = (searchParams.get('template') || 'ticket') as 'ticket' | 'back' | 'certificate';
  const TICKET_WIDTH_MM = 85;
  const TICKET_HEIGHT_MM = 140;
  const TICKET_WIDTH_TO_HEIGHT_RATIO = TICKET_WIDTH_MM / TICKET_HEIGHT_MM;
  const TEMPLATE_VERSION = '20260416_v2';
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [seatInfo, setSeatInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editorMode, setEditorMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<string>('');

  const ticketPrintRef = useRef<HTMLDivElement>(null);
  const certificatePrintRef = useRef<HTMLDivElement>(null);

  const fetchAttendee = useCallback(async (attendeeId: string) => {
    try {
        const data = await api.get(`/attendees/${attendeeId}`);
        setAttendee(data);
        const initialOverrides = data.ticket_overrides || {};
        setOverrides(initialOverrides);
        lastSavedPayloadRef.current = JSON.stringify({
          ticket_overrides: initialOverrides,
          full_name_en: data.full_name_en,
          job_title: data.job_title,
          profile_photo_url: data.profile_photo_url
        });
      try {
        const primaryHall = `${normalizeGovernorate(data.governorate).toUpperCase()}-2026-MAIN`;
        const halls = [primaryHall, 'MINYA-2026-MAIN', 'ASYUT-2026-MAIN', 'SOHAG-2026-MAIN', 'QENA-2026-MAIN'];
        const uniqueHalls = Array.from(new Set(halls));
        let seat: any = null;
        let table: any = null;
        for (const hallEventId of uniqueHalls) {
          const mapData = await api.get(`/seating/map?eventId=${hallEventId}`);
          seat = mapData.seats?.find((s: any) => s.attendee_id === attendeeId)
            || mapData.seats?.find((s: any) => data.barcode && s.seat_code === data.barcode)
            || mapData.seats?.find((s: any) => data.seat_number && data.seat_class && s.seat_number === data.seat_number && s.seat_class === data.seat_class && s.status === 'booked');
          if (seat) {
            table = mapData.tables?.find((t: any) => t.id === seat.table_id) || null;
            break;
          }
        }
        if (seat) {
          setSeatInfo({ seat, table });
          if (seat.seat_code !== data.barcode || Number(seat.seat_number) !== Number(data.seat_number || 0)) {
            const synced = { ...data, barcode: seat.seat_code, seat_number: Number(seat.seat_number), seat_class: seat.seat_class };
            setAttendee(synced as any);
          }
        } else {
          setSeatInfo(null);
        }
      } catch (e) {
        console.error(e);
      }
    } catch (error) {
      console.error('Error fetching attendee:', error);
      alert('Attendee not found');
      navigate('/attendees');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (id) {
      fetchAttendee(id);
    }
  }, [id, fetchAttendee]);

  const markPrinted = useCallback(async (documentType: 'ticket' | 'certificate') => {
    if (!id) return;
    try {
      const updated = await api.patch(`/attendees/${id}/mark-printed`, { document_type: documentType });
      setAttendee(updated);
    } catch (error) {
      console.error('Error marking printed document:', error);
    }
  }, [id]);

  const triggerPrintTicket = async () => {
    await handleSaveOverrides(true, true);
    handlePrintTicket();
  };

  const triggerPrintCertificate = async () => {
    await handleSaveOverrides(true, true);
    handlePrintCertificate();
  };

  const handlePrintTicket = useReactToPrint({
    contentRef: ticketPrintRef,
    documentTitle: attendee ? `ticket-${attendee.full_name}` : 'ticket',
    pageStyle: `
      @page { size: ${TICKET_WIDTH_MM}mm ${TICKET_HEIGHT_MM}mm; margin: 0; }
      html, body {
        width: ${TICKET_WIDTH_MM}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
      * {
        box-sizing: border-box !important;
      }
      body * {
        margin: 0 !important;
      }
      .ticket-print-page {
        width: ${TICKET_WIDTH_MM}mm !important;
        height: ${TICKET_HEIGHT_MM}mm !important;
        overflow: hidden !important;
        break-after: page !important;
        page-break-after: always !important;
      }
      .ticket-print-page:last-child {
        break-after: auto !important;
        page-break-after: auto !important;
      }
      .ticket-sheet {
        width: ${TICKET_WIDTH_MM}mm !important;
        height: ${TICKET_HEIGHT_MM}mm !important;
        margin: 0 !important;
        border: 0 !important;
        box-shadow: none !important;
      }
    `,
    onAfterPrint: () => {
      markPrinted('ticket');
    }
  });

  const handlePrintCertificate = useReactToPrint({
    contentRef: certificatePrintRef,
    documentTitle: attendee ? `certificate-${attendee.full_name}` : 'certificate',
    pageStyle: `@page { size: 297mm 210mm; margin: 0; } html, body { width: 297mm !important; height: 210mm !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`,
    onAfterPrint: () => {
      markPrinted('certificate');
    }
  });

  const handleDownloadQr = useCallback(() => {
    if (!attendee) return;
    const canvas = document.getElementById('qr-code-canvas-main') as HTMLCanvasElement;
    if (!canvas) {
       alert('QR Code غير متوفر للتحميل');
       return;
    }
    
    const padding = 10;
    const paddedCanvas = document.createElement('canvas');
    paddedCanvas.width = canvas.width + (padding * 2);
    paddedCanvas.height = canvas.height + (padding * 2);
    const ctx = paddedCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
      ctx.drawImage(canvas, padding, padding);
      
      const imgData = paddedCanvas.toDataURL('image/png');
      const pdf = new jsPDF({
         orientation: 'portrait',
         unit: 'px',
         format: [paddedCanvas.width, paddedCanvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, paddedCanvas.width, paddedCanvas.height);
      
      const baseName = String(attendee.full_name || attendee.id || 'attendee').replace(/[\\/:*?"<>|]/g, '_');
      pdf.save(`qr-${baseName}.pdf`);
    }
  }, [attendee]);

  const getGovernorateTemplateKey = (value?: string) => {
    const key = String(value || '').trim().toLowerCase();
    if (key.includes('minya') || key.includes('منيا')) return 'Minya';
    if (key.includes('asyut') || key.includes('assiut') || key.includes('أسيوط') || key.includes('اسيوط')) return 'Asyut';
    if (key.includes('sohag') || key.includes('سوهاج')) return 'Sohag';
    if (key.includes('qena') || key.includes('قنا')) return 'Qena';
    return 'Minya';
  };

  const frontTemplateByClass: Record<string, string> = {
    A: `/templates/ticket-front-a.jpg?v=${TEMPLATE_VERSION}`,
    B: `/templates/ticket-front-b.jpg?v=${TEMPLATE_VERSION}`,
    C: `/templates/ticket-front-c.jpg?v=${TEMPLATE_VERSION}`
  };

  const backTemplateByGovernorate: Record<string, string> = {
    Minya: '/templates/ticket-back-minya.jpg',
    Asyut: '/templates/ticket-back-asyut.jpg',
    Sohag: '/templates/ticket-back-sohag.jpg',
    Qena: '/templates/ticket-back-qena.jpg'
  };

  const certificateTemplate = '/templates/certificate-template.png';

  const transliterateArabicToEnglish = (input?: string | null) => {
    const value = String(input || '').trim();
    if (!value) return '';
    const dictionary: Record<string, string> = {
      'محمد': 'Mohamed', 'أحمد': 'Ahmed', 'محمود': 'Mahmoud', 'مصطفى': 'Mostafa',
      'حاتم': 'Hatem', 'علي': 'Ali', 'عبدالله': 'Abdullah', 'عبد': 'Abdel',
      'الرحمن': 'Rahman', 'عبدالرحمن': 'Abdelrahman', 'ربيع': 'Rabie',
      'حسن': 'Hassan', 'حسين': 'Hussein', 'عمر': 'Omar', 'عمرو': 'Amr',
      'يوسف': 'Youssef', 'خالد': 'Khaled', 'إبراهيم': 'Ibrahim', 'صلاح': 'Salah',
      'فاطمة': 'Fatma', 'الله': 'Allah', 'السجان': 'Elsaggan'
    };
    const map: Record<string, string> = {
      'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'aa', 'ء': 'a', 'ؤ': 'o', 'ئ': 'e',
      'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'g', 'ح': 'h', 'خ': 'kh',
      'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
      'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
      'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
      'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a',
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };
    return value
      .replace(/\s+/g, ' ')
      .split(' ')
      .map((word) => {
        if (dictionary[word]) return dictionary[word];
        const raw = word.split('').map((char) => map[char] ?? char).join('').trim();
        return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
      })
      .filter(Boolean)
      .join(' ');
  };

  const getDisplayName = (person: Attendee) => {
    const englishName = String(person.full_name_en || '').trim();
    if (englishName) return englishName;
    const transliterated = transliterateArabicToEnglish(person.full_name);
    return transliterated || person.full_name;
  };

  const getTicketNameFontSize = (name: string) => {
    if (name.length > 30) return '11.5px';
    if (name.length > 24) return '12.5px';
    if (name.length > 18) return '13.28px'; // approx 9.96pt
    return '13.28px'; // 9.96pt * 1.333 = 13.28px
  };

  const getJobTitleFontSize = (title: string) => {
    if (title.length > 30) return '10px';
    if (title.length > 22) return '11.5px';
    if (title.length > 16) return '13px';
    return '13.92px';
  };

  const getCertificateNameFontSize = (name: string) => {
    if (name.length > 28) return '28px';
    if (name.length > 22) return '31px';
    if (name.length > 18) return '34px';
    return '36.9px';
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.style.opacity = '0';
  };

  const buildSavePayload = useCallback(() => ({
    ticket_overrides: overrides,
    full_name_en: attendee?.full_name_en,
    job_title: attendee?.job_title,
    profile_photo_url: attendee?.profile_photo_url
  }), [attendee?.full_name_en, attendee?.job_title, attendee?.profile_photo_url, overrides]);

  const handleSaveOverrides = useCallback(async (silent = false, force = false) => {
    if (!id || !attendee) return;
    const payload = buildSavePayload();
    const serializedPayload = JSON.stringify(payload);
    if (!force && serializedPayload === lastSavedPayloadRef.current) return;

    setSavingOverrides(true);
    try {
      await api.patch(`/attendees/${id}`, payload);
      lastSavedPayloadRef.current = serializedPayload;
      if (silent !== true) {
        alert('تم حفظ الإعدادات والبيانات بنجاح');
        setEditorMode(false);
      }
    } catch (error) {
      console.error(error);
      if (silent !== true) {
        alert('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSavingOverrides(false);
    }
  }, [attendee, buildSavePayload, id]);

  const getOverride = useCallback((key: string, defaultVal: number | string) => {
    if (overrides[key] !== undefined) return overrides[key];
    return defaultVal;
  }, [overrides]);

  const handleDownloadTicketPdf = useCallback(async () => {
    if (!attendee) return;

    const PDF_DPI = 300;
    const PX_PER_MM = PDF_DPI / 25.4;
    const CSS_TO_EXPORT_SCALE = PDF_DPI / 96;

    class TicketPdfExportError extends Error {
      code: string;
      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    }

    const mmToPx = (mm: number) => Math.max(1, Math.round(mm * PX_PER_MM));
    const percentToPx = (total: number, percent: number) => (total * Number(percent || 0)) / 100;
    const asCssPx = (value: number) => Number(value || 0) * CSS_TO_EXPORT_SCALE;

    const makeCanvas = (width: number, height: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new TicketPdfExportError('CANVAS_CONTEXT', 'فشل تجهيز Canvas للتصدير');
      return { canvas, ctx };
    };

    const loadImage = async (src: string, label: string): Promise<HTMLImageElement> => {
      const finalSrc = src.startsWith('http') || src.startsWith('data:')
        ? src
        : `${window.location.origin}${src}`;

      const tryLoad = (imageSrc: string, crossOrigin: boolean) => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (crossOrigin) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`تعذر تحميل ${label}`));
        img.src = imageSrc;
      });

      let objectUrl: string | null = null;
      try {
        if (!finalSrc.startsWith('data:')) {
          const response = await fetch(finalSrc, { cache: 'no-store', mode: 'cors' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          const img = await tryLoad(objectUrl, false);
          return img;
        }
        return await tryLoad(finalSrc, false);
      } catch {
        return await tryLoad(finalSrc, true);
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    };

    const drawRoundedClip = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      radius: number
    ) => {
      const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const drawImageWithFit = (
      ctx: CanvasRenderingContext2D,
      img: HTMLImageElement,
      x: number,
      y: number,
      w: number,
      h: number,
      fitMode: 'cover' | 'contain',
      scale: number,
      translateXPercent: number,
      translateYPercent: number
    ) => {
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const baseRatio = fitMode === 'contain'
        ? Math.min(w / img.width, h / img.height)
        : Math.max(w / img.width, h / img.height);
      const ratio = baseRatio * safeScale;
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const offsetX = ((w - drawW) / 2) + ((translateXPercent || 0) / 100) * w;
      const offsetY = ((h - drawH) / 2) + ((translateYPercent || 0) / 100) * h;
      ctx.drawImage(img, x + offsetX, y + offsetY, drawW, drawH);
    };

    const drawText = (
      ctx: CanvasRenderingContext2D,
      {
        text,
        x,
        y,
        maxWidth,
        align,
        color,
        fontFamily,
        fontWeight,
        fontSizePx,
        lineHeight,
        wrap
      }: {
        text: string;
        x: number;
        y: number;
        maxWidth: number;
        align: 'left' | 'center';
        color: string;
        fontFamily: string;
        fontWeight: number;
        fontSizePx: number;
        lineHeight: number;
        wrap: boolean;
      }
    ) => {
      const content = String(text || '').trim();
      if (!content) return;

      ctx.save();
      ctx.fillStyle = color;
      ctx.direction = 'ltr';
      ctx.textBaseline = 'top';
      ctx.textAlign = align;
      ctx.font = `${fontWeight} ${Math.max(6, fontSizePx)}px ${fontFamily}`;

      if (!wrap) {
        ctx.fillText(content, x, y, maxWidth);
        ctx.restore();
        return;
      }

      const words = content.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = '';
      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      });
      if (current) lines.push(current);

      const lh = Math.max(1, lineHeight) * Math.max(6, fontSizePx);
      lines.forEach((line, index) => {
        ctx.fillText(line, x, y + (index * lh), maxWidth);
      });
      ctx.restore();
    };

    const getQrCanvas = async () => {
      let attempts = 0;
      while (attempts < 5) {
        const qr = document.getElementById('qr-code-canvas-main') as HTMLCanvasElement | null;
        if (qr && qr.width > 0 && qr.height > 0) return qr;
        attempts += 1;
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      }
      throw new TicketPdfExportError('QR_NOT_READY', 'QR غير جاهز حالياً. حاول مرة أخرى بعد ثوانٍ');
    };

    const composeFrontCanvas = async (): Promise<HTMLCanvasElement> => {
      const resolvedSeatClass = seatInfo?.seat?.seat_class || attendee.seat_class;
      const frontSrc = frontTemplateByClass[resolvedSeatClass || 'C'] || frontTemplateByClass.C;
      const fullName = getDisplayName(attendee);
      const jobTitle = String(attendee.job_title || '').trim();
      const resolvedBarcode = seatInfo?.seat?.seat_code || attendee.barcode;
      const resolvedSeatNumber = seatInfo?.seat?.seat_number ?? attendee.seat_number ?? parseSeatNumberFromSeatCode(resolvedBarcode);
      const tableOrWave = parseTableOrWaveFromSeatCode(resolvedBarcode, resolvedSeatClass);
      const qrCanvas = await getQrCanvas();
      const frontTemplate = await loadImage(frontSrc, 'قالب وش التيكت');

      const width = mmToPx(TICKET_WIDTH_MM);
      const height = mmToPx(TICKET_HEIGHT_MM);
      const { canvas, ctx } = makeCanvas(width, height);

      ctx.fillStyle = '#10141c';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(frontTemplate, 0, 0, width, height);

      const photoX = percentToPx(width, Number(getOverride('photo_x', 50.5)));
      const photoY = percentToPx(height, Number(getOverride('photo_y', 17.5)));
      const photoW = percentToPx(width, Number(getOverride('photo_w', 41)));
      const photoH = percentToPx(
        height,
        Number(getOverride('photo_h', Number(getOverride('photo_w', 41)) * TICKET_WIDTH_TO_HEIGHT_RATIO))
      );
      const photoLeft = photoX - (photoW / 2);
      const photoTop = photoY;
      const radius = asCssPx(18);

      drawRoundedClip(ctx, photoLeft, photoTop, photoW, photoH, radius);
      ctx.fillStyle = '#10141c';
      ctx.fill();

      if (attendee.profile_photo_url) {
        try {
          const profile = await loadImage(attendee.profile_photo_url, 'الصورة الشخصية');
          ctx.save();
          drawRoundedClip(ctx, photoLeft, photoTop, photoW, photoH, radius);
          ctx.clip();
          drawImageWithFit(
            ctx,
            profile,
            photoLeft,
            photoTop,
            photoW,
            photoH,
            Number(getOverride('photo_fit', 0)) === 1 ? 'contain' : 'cover',
            Number(getOverride('photo_scale', 1)),
            Number(getOverride('photo_trans_x', 0)),
            Number(getOverride('photo_trans_y', 0))
          );
          ctx.restore();
        } catch {
          ctx.save();
          drawRoundedClip(ctx, photoLeft, photoTop, photoW, photoH, radius);
          ctx.clip();
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(photoLeft, photoTop, photoW, photoH);
          ctx.restore();
        }
      } else {
        ctx.save();
        drawRoundedClip(ctx, photoLeft, photoTop, photoW, photoH, radius);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(photoLeft, photoTop, photoW, photoH);
        ctx.restore();
      }

      drawText(ctx, {
        text: fullName,
        x: percentToPx(width, Number(getOverride('name_x', 50.5))),
        y: percentToPx(height, Number(getOverride('name_y', 45))),
        maxWidth: percentToPx(width, Number(getOverride('name_w', 64))),
        align: 'center',
        color: '#c39d78',
        fontFamily: '"TT Runs Trial", sans-serif',
        fontWeight: 700,
        fontSizePx: asCssPx(Number(getOverride('name_size', parseFloat(getTicketNameFontSize(fullName))))),
        lineHeight: Number(getOverride('name_lh', 1)),
        wrap: Number(getOverride('name_wrap', 0)) === 1
      });

      drawText(ctx, {
        text: jobTitle,
        x: percentToPx(width, Number(getOverride('title_x', 46))),
        y: percentToPx(height, Number(getOverride('title_y', 49.8))),
        maxWidth: percentToPx(width, Number(getOverride('title_w', 42))),
        align: 'left',
        color: '#e0d3c2',
        fontFamily: '"TT Runs Trial", sans-serif',
        fontWeight: 600,
        fontSizePx: asCssPx(Number(getOverride('title_size', parseFloat(getJobTitleFontSize(jobTitle))))),
        lineHeight: Number(getOverride('title_lh', 1.2)),
        wrap: Number(getOverride('title_wrap', 0)) === 1
      });

      const qrSize = asCssPx(Number(getOverride('qr_size', 62)));
      const qrPadding = asCssPx(3);
      const qrCenterX = percentToPx(width, 49.5);
      const qrTopY = percentToPx(height, Number(getOverride('qr_y', 70.5)));
      const qrX = qrCenterX - (qrSize / 2);
      const qrY = qrTopY;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX - qrPadding, qrY - qrPadding, qrSize + (2 * qrPadding), qrSize + (2 * qrPadding));
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

      const seatX = percentToPx(width, Number(getOverride('seat_x', 80)));
      const seatFont = asCssPx(Number(getOverride('seat_size', 13)));
      drawText(ctx, {
        text: String(tableOrWave || ''),
        x: seatX,
        y: percentToPx(height, Number(getOverride('seat_y_1', 89.5))),
        maxWidth: percentToPx(width, 40),
        align: 'center',
        color: '#e0d3c2',
        fontFamily: 'sans-serif',
        fontWeight: 700,
        fontSizePx: seatFont,
        lineHeight: 1,
        wrap: false
      });
      drawText(ctx, {
        text: String(resolvedSeatNumber ?? '-'),
        x: seatX,
        y: percentToPx(height, Number(getOverride('seat_y_2', 93))),
        maxWidth: percentToPx(width, 40),
        align: 'center',
        color: '#e0d3c2',
        fontFamily: 'sans-serif',
        fontWeight: 700,
        fontSizePx: seatFont,
        lineHeight: 1,
        wrap: false
      });

      return canvas;
    };

    const composeBackCanvas = async (): Promise<HTMLCanvasElement> => {
      const key = getGovernorateTemplateKey(attendee.governorate);
      const backSrc = backTemplateByGovernorate[key] || backTemplateByGovernorate.Minya;
      const backTemplate = await loadImage(backSrc, 'قالب ظهر التيكت');
      const width = mmToPx(TICKET_WIDTH_MM);
      const height = mmToPx(TICKET_HEIGHT_MM);
      const { canvas, ctx } = makeCanvas(width, height);
      ctx.fillStyle = '#10141c';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(backTemplate, 0, 0, width, height);
      return canvas;
    };

    try {
      await handleSaveOverrides(true, true);
      const [frontCanvas, backCanvas] = await Promise.all([composeFrontCanvas(), composeBackCanvas()]);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [TICKET_WIDTH_MM, TICKET_HEIGHT_MM],
        compress: true,
        putOnlyUsedFonts: true
      });

      pdf.addImage(frontCanvas, 'PNG', 0, 0, TICKET_WIDTH_MM, TICKET_HEIGHT_MM, undefined, 'FAST');
      pdf.addPage([TICKET_WIDTH_MM, TICKET_HEIGHT_MM], 'portrait');
      pdf.addImage(backCanvas, 'PNG', 0, 0, TICKET_WIDTH_MM, TICKET_HEIGHT_MM, undefined, 'FAST');

      const baseName = String(attendee.full_name || attendee.id || 'attendee').replace(/[\\/:*?"<>|]/g, '_');
      const seatToken = String(attendee.barcode || `${attendee.seat_class || 'X'}-${attendee.seat_number || '0'}`).replace(/[\\/:*?"<>|]/g, '_');
      pdf.save(`ticket-${seatToken}-${baseName}.pdf`);
      await markPrinted('ticket');
    } catch (error: unknown) {
      console.error('Error generating ticket PDF:', error);
      if (error instanceof TicketPdfExportError) {
        alert(error.message);
        return;
      }
      alert('تعذر حفظ PDF الآن. تأكد من وجود القوالب والصورة والـ QR ثم حاول مرة أخرى');
    }
  }, [attendee, backTemplateByGovernorate, frontTemplateByClass, getDisplayName, getGovernorateTemplateKey, getJobTitleFontSize, getOverride, getTicketNameFontSize, handleSaveOverrides, markPrinted, seatInfo, TICKET_HEIGHT_MM, TICKET_WIDTH_MM, TICKET_WIDTH_TO_HEIGHT_RATIO]);

  useEffect(() => {
    if (!id || !attendee) return;
    const serializedPayload = JSON.stringify(buildSavePayload());
    if (serializedPayload === lastSavedPayloadRef.current) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      handleSaveOverrides(true);
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [attendee, buildSavePayload, handleSaveOverrides, id]);

  const handleTextEdit = (field: 'full_name_en' | 'job_title', value: string) => {
    setAttendee(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const renderTicketFront = (qrCanvasId?: string) => {
    if (!attendee) return null;
    const resolvedSeatClass = seatInfo?.seat?.seat_class || attendee.seat_class;
    const frontSrc = frontTemplateByClass[resolvedSeatClass || 'C'] || frontTemplateByClass.C;
    const fullName = getDisplayName(attendee);
    const jobTitle = String(attendee.job_title || '').trim();
    const resolvedBarcode = seatInfo?.seat?.seat_code || attendee.barcode;
    const resolvedSeatNumber = seatInfo?.seat?.seat_number ?? attendee.seat_number ?? parseSeatNumberFromSeatCode(resolvedBarcode);
    const tableOrWave = parseTableOrWaveFromSeatCode(resolvedBarcode, resolvedSeatClass);

    return (
      <div className="ticket-sheet relative overflow-hidden bg-[#0a0a0a]">
        <div className="absolute inset-0 flex items-center justify-center text-gray-800 text-sm border border-gray-800">صورة القالب مفقودة ({frontSrc})</div>
        <img src={frontSrc} alt="ticket-front-template" onError={handleImageError} className="absolute inset-0 h-full w-full object-cover z-0 transition-opacity duration-200" />
        
        <div className="absolute z-10 rounded-[18px] overflow-hidden bg-[#10141c]" style={{ 
          top: `${Number(getOverride('photo_y', 17.5))}%`, 
          left: `${Number(getOverride('photo_x', 50.5))}%`, 
          transform: 'translateX(-50%)', 
          width: `${Number(getOverride('photo_w', 41))}%`, 
          height: `${Number(getOverride('photo_h', Number(getOverride('photo_w', 41)) * TICKET_WIDTH_TO_HEIGHT_RATIO))}%`,
          boxShadow: '0 0 0 4px #10141c, 0 0 0 7px #c7a57a'
        }}>
          {attendee.profile_photo_url ? (
            <img 
              src={attendee.profile_photo_url} 
              alt={attendee.full_name} 
              crossOrigin="anonymous" 
              className="h-full w-full"
              style={{
                objectFit: Number(getOverride('photo_fit', 0)) === 1 ? 'contain' : 'cover',
                objectPosition: "center",
                transformOrigin: "center center",
                transform: `translate(${Number(getOverride('photo_trans_x', 0))}%, ${Number(getOverride('photo_trans_y', 0))}%) scale(${Number(getOverride('photo_scale', 1))})`
              }}
            />
          ) : (
            <div className="h-full w-full bg-white/10 flex items-center justify-center text-white/50 text-xs">
              صورة شخصية
            </div>
          )}
        </div>

        <div className="absolute z-10 flex justify-center" style={{ 
          top: `${Number(getOverride('name_y', 45))}%`, 
          left: `${Number(getOverride('name_x', 50.5))}%`, 
          width: `${Number(getOverride('name_w', 64))}%`, 
          transform: 'translateX(-50%)' 
        }}>
          <div
            className="font-bold text-[#c39d78] text-center"
            dir="ltr"
            style={{
              fontFamily: '"TT Runs Trial", sans-serif',
              fontWeight: 700,
              fontSize: `${getOverride('name_size', parseFloat(getTicketNameFontSize(fullName)))}px`,
              lineHeight: `${getOverride('name_lh', 1)}`,
              letterSpacing: '0.02em',
              whiteSpace: Number(getOverride('name_wrap', 0)) ? 'normal' : 'nowrap',
              wordBreak: Number(getOverride('name_wrap', 0)) ? 'break-word' : 'normal',
              overflow: 'visible',
              width: '100%',
              maxWidth: '100%'
            }}
          >
            {fullName}
          </div>
        </div>

        <div className="absolute z-10 flex justify-start" style={{ 
          top: `${Number(getOverride('title_y', 49.8))}%`, 
          left: `${Number(getOverride('title_x', 46))}%`, 
          width: `${Number(getOverride('title_w', 42))}%` 
        }}>
          <div
            className="text-[#e0d3c2]"
            dir="ltr"
            style={{
              fontFamily: '"TT Runs Trial", sans-serif',
              fontWeight: 600,
              fontSize: `${getOverride('title_size', parseFloat(getJobTitleFontSize(jobTitle)))}px`,
              lineHeight: `${getOverride('title_lh', 1.2)}`,
              whiteSpace: Number(getOverride('title_wrap', 0)) ? 'normal' : 'nowrap',
              wordBreak: Number(getOverride('title_wrap', 0)) ? 'break-word' : 'normal',
              overflow: 'visible',
              textAlign: 'left',
              width: '100%',
              maxWidth: '100%'
            }}
          >
            {jobTitle}
          </div>
        </div>

        <div className="absolute z-10 flex justify-center" style={{ 
          top: `${Number(getOverride('qr_y', 70.5))}%`, 
          left: '49.5%', 
          width: '100%', 
          transform: 'translateX(-50%)' 
        }}>
          {attendee.qr_code || attendee.id ? (
            <div className="bg-white p-[3px] rounded-[3px]">
               <QRCodeCanvas id={qrCanvasId} value={attendee.qr_code || attendee.id} size={Number(getOverride('qr_size', 62))} level="H" includeMargin={false} />
            </div>
          ) : (
            <div className="h-[62px]" />
          )}
        </div>

        <div className="absolute z-10 flex justify-center" style={{ top: `${Number(getOverride('seat_y_1', 89.5))}%`, left: `${Number(getOverride('seat_x', 80))}%`, width: '40%', transform: 'translateX(-50%)' }}>
          <div className="font-bold text-[#e0d3c2] text-center" dir="ltr" style={{ fontSize: `${getOverride('seat_size', 13)}px`, lineHeight: '1', whiteSpace: 'nowrap' }}>
            {tableOrWave}
          </div>
        </div>

        <div className="absolute z-10 flex justify-center" style={{ top: `${Number(getOverride('seat_y_2', 93))}%`, left: `${Number(getOverride('seat_x', 80))}%`, width: '40%', transform: 'translateX(-50%)' }}>
          <div className="font-bold text-[#e0d3c2] text-center" dir="ltr" style={{ fontSize: `${getOverride('seat_size', 13)}px`, lineHeight: '1', whiteSpace: 'nowrap' }}>
            {resolvedSeatNumber !== null && resolvedSeatNumber !== undefined ? resolvedSeatNumber : '-'}
          </div>
        </div>
      </div>
    );
  };

  const renderTicketBack = () => {
    if (!attendee) return null;
    const key = getGovernorateTemplateKey(attendee.governorate);
    const backSrc = backTemplateByGovernorate[key] || backTemplateByGovernorate.Minya;
    return (
      <div className="ticket-sheet relative overflow-hidden bg-[#0a0a0a]">
        <div className="absolute inset-0 flex items-center justify-center text-gray-800 text-sm border border-gray-800">صورة القالب مفقودة ({backSrc})</div>
        <img src={backSrc} alt="ticket-back-template" onError={handleImageError} className="absolute inset-0 h-full w-full object-cover z-0 transition-opacity duration-200" />
      </div>
    );
  };

  const renderCertificate = () => {
    if (!attendee) return null;
    const fullName = getDisplayName(attendee);
    return (
      <div className="certificate-sheet relative overflow-hidden bg-[#111]">
        <div className="absolute inset-0 flex items-center justify-center text-gray-800 text-sm border border-gray-800">صورة القالب مفقودة ({certificateTemplate})</div>
        <img src={certificateTemplate} alt="certificate-template" onError={handleImageError} className="absolute inset-0 h-full w-full object-cover z-0 transition-opacity duration-200" />
        
        <div className="absolute z-10 flex justify-center" style={{ 
          top: `${Number(getOverride('cert_name_y', 43.8))}%`, 
          left: `${Number(getOverride('cert_name_x', 50))}%`, 
          width: '62%', 
          transform: 'translate(-50%, -50%)' 
        }}>
          <div
            className="font-bold text-center"
            dir="ltr"
            style={{
              color: '#f5efe7',
              fontFamily: 'Roboto, sans-serif',
              fontSize: `${getOverride('cert_name_size', parseFloat(getCertificateNameFontSize(fullName)))}px`,
              lineHeight: '1.05',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%'
            }}
          >
            {fullName}
          </div>
        </div>
      </div>
    );
  };

  const handleOverrideChange = (key: string, value: string) => {
    setOverrides(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !attendee) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('يجب اختيار ملف صورة صالح');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الصورة يجب ألا يتجاوز 5 ميجابايت');
      return;
    }

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}-${Math.random()}.${fileExt}`;
      
      // Upload using our api wrapper which handles the endpoint logic
      const formData = new FormData();
      formData.append('file', file);
      
      // We'll upload directly to a specific endpoint or use a base64 workaround for the preview
      // Since we might not have direct Supabase storage access from the frontend without proper RLS policies
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setAttendee(prev => prev ? { ...prev, profile_photo_url: base64String } : prev);
        setUploadingImage(false);
        alert('تم تغيير الصورة بنجاح وسيتم حفظها تلقائياً');
      };
      reader.onerror = () => {
        setUploadingImage(false);
        alert('حدث خطأ أثناء قراءة الصورة');
      };
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('Error processing image:', error);
      alert('حدث خطأ أثناء معالجة الصورة');
      setUploadingImage(false);
    } finally {
      // Reset input
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const renderEditorPanel = () => {
    if (!editorMode || !attendee) return null;

    return (
      <div className="fixed top-0 right-0 w-80 h-screen bg-white shadow-2xl border-l border-gray-200 p-4 overflow-y-auto z-50 flex flex-col">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-lg font-bold text-gray-800">تعديل التيكت / الشهادة</h2>
          <button onClick={() => setEditorMode(false)} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        
        <div className="space-y-6 flex-1">
          {/* Profile Photo Settings */}
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b pb-1">
              <h3 className="font-semibold text-sm text-emerald-600">الصورة الشخصية</h3>
              <label className={`cursor-pointer inline-flex items-center text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 ${uploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="h-3 w-3 ml-1" />
                {uploadingImage ? 'جاري الرفع...' : 'تغيير الصورة'}
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                />
              </label>
            </div>
            <div className="flex items-center justify-between bg-emerald-50 p-2 rounded border border-emerald-100 mb-2">
              <label className="text-xs text-emerald-800 font-bold">إلغاء القص التلقائي (إظهار كامل الصورة)</label>
              <input type="checkbox" checked={Number(getOverride('photo_fit', 0)) === 1} onChange={(e) => handleOverrideChange('photo_fit', e.target.checked ? '1' : '0')} className="w-5 h-5 accent-emerald-600" />
            </div>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>تكبير الصورة (Zoom)</span> <span>{getOverride('photo_scale', 1)}x</span></label>
              <input type="range" min="0.1" max="5" step="0.05" value={getOverride('photo_scale', 1)} onChange={(e) => handleOverrideChange('photo_scale', e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>تحريك الصورة يمين/يسار (Pan X)</span> <span>{getOverride('photo_trans_x', 0)}%</span></label>
              <input type="range" min="-100" max="100" step="1" value={getOverride('photo_trans_x', 0)} onChange={(e) => handleOverrideChange('photo_trans_x', e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>تحريك الصورة أعلى/أسفل (Pan Y)</span> <span>{getOverride('photo_trans_y', 0)}%</span></label>
              <input type="range" min="-100" max="100" step="1" value={getOverride('photo_trans_y', 0)} onChange={(e) => handleOverrideChange('photo_trans_y', e.target.value)} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dashed">
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>تحريك الإطار (X)</span> <span>{getOverride('photo_x', 50.5)}%</span></label>
                <input type="range" min="30" max="70" step="0.5" value={getOverride('photo_x', 50.5)} onChange={(e) => handleOverrideChange('photo_x', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>تحريك الإطار (Y)</span> <span>{getOverride('photo_y', 17.5)}%</span></label>
                <input type="range" min="5" max="40" step="0.5" value={getOverride('photo_y', 17.5)} onChange={(e) => handleOverrideChange('photo_y', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>ارتفاع الإطار (H)</span> <span>{getOverride('photo_h', Number(getOverride('photo_w', 41)) * TICKET_WIDTH_TO_HEIGHT_RATIO).toFixed(2)}%</span></label>
                <input type="range" min="10" max="40" step="0.1" value={getOverride('photo_h', Number(getOverride('photo_w', 41)) * TICKET_WIDTH_TO_HEIGHT_RATIO)} onChange={(e) => handleOverrideChange('photo_h', e.target.value)} className="w-full" />
              </div>
            </div>
          </div>

          {/* Ticket Name Settings */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-emerald-600 border-b pb-1">اسم المشترك (التيكت)</h3>
            <div className="mb-2">
              <label className="text-xs text-gray-600 block mb-1">تعديل الاسم (إنجليزي)</label>
              <input 
                type="text" 
                value={attendee.full_name_en || ''} 
                onChange={(e) => handleTextEdit('full_name_en', e.target.value)}
                className="w-full text-sm p-1 border rounded text-right"
                dir="ltr"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600">تعدد الأسطر (Wrap)</label>
              <input type="checkbox" checked={Number(getOverride('name_wrap', 0)) === 1} onChange={(e) => handleOverrideChange('name_wrap', e.target.checked ? '1' : '0')} />
            </div>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>Font Size</span> <span>{getOverride('name_size', parseFloat(getTicketNameFontSize(getDisplayName(attendee))))}px</span></label>
              <input type="range" min="8" max="24" step="0.5" value={getOverride('name_size', parseFloat(getTicketNameFontSize(getDisplayName(attendee))))} onChange={(e) => handleOverrideChange('name_size', e.target.value)} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Width</span> <span>{getOverride('name_w', 64)}%</span></label>
                <input type="range" min="20" max="100" step="1" value={getOverride('name_w', 64)} onChange={(e) => handleOverrideChange('name_w', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Line Height</span> <span>{getOverride('name_lh', 1)}</span></label>
                <input type="range" min="0.5" max="2.5" step="0.1" value={getOverride('name_lh', 1)} onChange={(e) => handleOverrideChange('name_lh', e.target.value)} className="w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move X</span> <span>{getOverride('name_x', 50.5)}%</span></label>
                <input type="range" min="30" max="70" step="0.5" value={getOverride('name_x', 50.5)} onChange={(e) => handleOverrideChange('name_x', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move Y</span> <span>{getOverride('name_y', 45)}%</span></label>
                <input type="range" min="30" max="60" step="0.5" value={getOverride('name_y', 45)} onChange={(e) => handleOverrideChange('name_y', e.target.value)} className="w-full" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-emerald-600 border-b pb-1">المسمى الوظيفي (التيكت)</h3>
            <div className="mb-2">
              <label className="text-xs text-gray-600 block mb-1">تعديل المسمى الوظيفي</label>
              <input 
                type="text" 
                value={attendee.job_title || ''} 
                onChange={(e) => handleTextEdit('job_title', e.target.value)}
                className="w-full text-sm p-1 border rounded text-right"
                dir="ltr"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-600">تعدد الأسطر (Wrap)</label>
              <input type="checkbox" checked={Number(getOverride('title_wrap', 0)) === 1} onChange={(e) => handleOverrideChange('title_wrap', e.target.checked ? '1' : '0')} />
            </div>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>Font Size</span> <span>{getOverride('title_size', parseFloat(getJobTitleFontSize(attendee?.job_title || '')))}px</span></label>
              <input type="range" min="8" max="24" step="0.5" value={getOverride('title_size', parseFloat(getJobTitleFontSize(attendee?.job_title || '')))} onChange={(e) => handleOverrideChange('title_size', e.target.value)} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Width</span> <span>{getOverride('title_w', 42)}%</span></label>
                <input type="range" min="20" max="100" step="1" value={getOverride('title_w', 42)} onChange={(e) => handleOverrideChange('title_w', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Line Height</span> <span>{getOverride('title_lh', 1.2)}</span></label>
                <input type="range" min="0.5" max="2.5" step="0.1" value={getOverride('title_lh', 1.2)} onChange={(e) => handleOverrideChange('title_lh', e.target.value)} className="w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move X</span> <span>{getOverride('title_x', 46)}%</span></label>
                <input type="range" min="30" max="70" step="0.5" value={getOverride('title_x', 46)} onChange={(e) => handleOverrideChange('title_x', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move Y</span> <span>{getOverride('title_y', 49.8)}%</span></label>
                <input type="range" min="30" max="60" step="0.5" value={getOverride('title_y', 49.8)} onChange={(e) => handleOverrideChange('title_y', e.target.value)} className="w-full" />
              </div>
            </div>
          </div>

          {/* Ticket QR Code Settings */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-emerald-600 border-b pb-1">الـ QR Code</h3>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>Size</span> <span>{getOverride('qr_size', 62)}px</span></label>
              <input type="range" min="40" max="100" step="1" value={getOverride('qr_size', 62)} onChange={(e) => handleOverrideChange('qr_size', e.target.value)} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>Move Y</span> <span>{getOverride('qr_y', 70.5)}%</span></label>
              <input type="range" min="60" max="85" step="0.5" value={getOverride('qr_y', 70.5)} onChange={(e) => handleOverrideChange('qr_y', e.target.value)} className="w-full" />
            </div>
          </div>

          {/* Ticket Seat Settings */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-emerald-600 border-b pb-1">أرقام المقاعد</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move X (يمين/يسار)</span> <span>{getOverride('seat_x', 80)}%</span></label>
                <input type="range" min="50" max="100" step="0.5" value={getOverride('seat_x', 80)} onChange={(e) => handleOverrideChange('seat_x', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Font Size</span> <span>{getOverride('seat_size', 13)}px</span></label>
                <input type="range" min="8" max="24" step="0.5" value={getOverride('seat_size', 13)} onChange={(e) => handleOverrideChange('seat_size', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move Y (السطر 1)</span> <span>{getOverride('seat_y_1', 89.5)}%</span></label>
                <input type="range" min="50" max="100" step="0.5" value={getOverride('seat_y_1', 89.5)} onChange={(e) => handleOverrideChange('seat_y_1', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move Y (السطر 2)</span> <span>{getOverride('seat_y_2', 93)}%</span></label>
                <input type="range" min="50" max="100" step="0.5" value={getOverride('seat_y_2', 93)} onChange={(e) => handleOverrideChange('seat_y_2', e.target.value)} className="w-full" />
              </div>
            </div>
          </div>

          {/* Certificate Name Settings */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-emerald-600 border-b pb-1">اسم المشترك (الشهادة)</h3>
            <div>
              <label className="text-xs text-gray-600 flex justify-between"><span>Font Size</span> <span>{getOverride('cert_name_size', parseFloat(getCertificateNameFontSize(getDisplayName(attendee))))}px</span></label>
              <input type="range" min="20" max="60" step="1" value={getOverride('cert_name_size', parseFloat(getCertificateNameFontSize(getDisplayName(attendee))))} onChange={(e) => handleOverrideChange('cert_name_size', e.target.value)} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move X</span> <span>{getOverride('cert_name_x', 50)}%</span></label>
                <input type="range" min="30" max="70" step="0.5" value={getOverride('cert_name_x', 50)} onChange={(e) => handleOverrideChange('cert_name_x', e.target.value)} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-gray-600 flex justify-between"><span>Move Y</span> <span>{getOverride('cert_name_y', 43.8)}%</span></label>
                <input type="range" min="30" max="60" step="0.5" value={getOverride('cert_name_y', 43.8)} onChange={(e) => handleOverrideChange('cert_name_y', e.target.value)} className="w-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t mt-4 flex gap-2">
          <button 
            onClick={() => handleSaveOverrides(false)}
            disabled={savingOverrides}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-md font-semibold text-sm flex items-center justify-center"
          >
            {savingOverrides ? 'جاري الحفظ...' : <><Save className="h-4 w-4 ml-2" /> حفظ التعديلات</>}
          </button>
          <button 
            onClick={() => {
              if(confirm('هل أنت متأكد من مسح جميع التعديلات المخصصة؟')) {
                setOverrides({});
              }
            }}
            className="px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-md text-sm font-medium"
          >
            مسح
          </button>
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!attendee) return <div className="p-8 text-center">Attendee not found</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 flex">
      {renderEditorPanel()}
      <div className={`flex-1 transition-all ${editorMode ? 'mr-80' : ''}`}>
        <style>{`
        .ticket-sheet {
          width: ${TICKET_WIDTH_MM}mm;
          height: ${TICKET_HEIGHT_MM}mm;
          background-color: #10141c;
        }
        .certificate-sheet {
          width: 297mm;
          height: 210mm;
          background-color: #111;
        }
        .preview-wrap {
          transform-origin: top center;
        }
        @media (max-width: 768px) {
          .preview-wrap {
            transform: scale(0.7);
          }
        }
        @media print {
          @page {
            size: ${TICKET_WIDTH_MM}mm ${TICKET_HEIGHT_MM}mm;
            margin: 0 !important;
          }
          html, body {
            width: ${TICKET_WIDTH_MM}mm !important;
            height: ${TICKET_HEIGHT_MM}mm !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          .no-print {
            display: none !important;
          }
          .ticket-sheet, .certificate-sheet {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            position: relative !important;
            overflow: hidden !important;
          }
        }
      `}</style>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 no-print">
        <button onClick={() => navigate('/attendees')} className="inline-flex items-center text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5 mr-2" />
          رجوع للقائمة
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSearchParams({ template: 'ticket' })}
            className={`inline-flex items-center px-3 py-2 text-sm rounded-md border ${previewMode === 'ticket' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            <Ticket className="h-4 w-4 ml-2" />
            معاينة التيكت (وش)
          </button>
          <button
            onClick={() => setSearchParams({ template: 'back' })}
            className={`inline-flex items-center px-3 py-2 text-sm rounded-md border ${previewMode === 'back' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            <ScanFace className="h-4 w-4 ml-2" />
            معاينة التيكت (ظهر)
          </button>
          <button
            onClick={() => setSearchParams({ template: 'certificate' })}
            className={`inline-flex items-center px-3 py-2 text-sm rounded-md border ${previewMode === 'certificate' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300'}`}
          >
            <FileBadge2 className="h-4 w-4 ml-2" />
            معاينة الشهادة
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 no-print">
        {!editorMode && (
          <button onClick={() => setEditorMode(true)} className="inline-flex items-center px-4 py-2 rounded-md text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
            <Settings2 className="h-4 w-4 ml-2" />
            تعديل مخصص
          </button>
        )}
        <button onClick={triggerPrintTicket} className="inline-flex items-center px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
          <Printer className="h-4 w-4 ml-2" />
          طباعة التيكت
        </button>
        <button onClick={handleDownloadQr} className="inline-flex items-center px-4 py-2 rounded-md text-white bg-slate-700 hover:bg-slate-800">
          <Download className="h-4 w-4 ml-2" />
          حفظ QR فقط
        </button>
        <button onClick={handleDownloadTicketPdf} className="inline-flex items-center px-4 py-2 rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200">
          <Download className="h-4 w-4 ml-2" />
          حفظ PDF للتيكت
        </button>
        <button onClick={triggerPrintCertificate} className="inline-flex items-center px-4 py-2 rounded-md text-white bg-emerald-600 hover:bg-emerald-700">
          <Printer className="h-4 w-4 ml-2" />
          طباعة الشهادة
        </button>
        <button onClick={triggerPrintCertificate} className="inline-flex items-center px-4 py-2 rounded-md text-emerald-700 bg-emerald-100 hover:bg-emerald-200">
          <Printer className="h-4 w-4 ml-2" />
          حفظ PDF للشهادة
        </button>
        <div className="mr-auto flex items-center gap-2 text-sm">
          <span className={`px-3 py-1 rounded-full border ${attendee.ticket_printed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            التيكت: {attendee.ticket_printed ? 'اتطبع' : 'لم يُطبع'}
          </span>
          <span className={`px-3 py-1 rounded-full border ${attendee.certificate_printed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            الشهادة: {attendee.certificate_printed ? 'اتطبعت' : 'لم تُطبع'}
          </span>
        </div>
      </div>

      <div className="flex justify-center flex-col items-center">
          {/* Visible Previews */}
          <div className="preview-wrap">
            <div className="flex items-center gap-2 mb-2 text-white bg-slate-800 px-3 py-1 rounded-t-lg">
              <Printer className="w-4 h-4" /> معاينة التيكت (وش)
            </div>
            {renderTicketFront('qr-code-canvas-main')}
          </div>

          <div className="preview-wrap mt-8">
            <div className="flex items-center gap-2 mb-2 text-white bg-slate-800 px-3 py-1 rounded-t-lg">
              <Printer className="w-4 h-4" /> معاينة التيكت (ظهر)
            </div>
            {renderTicketBack()}
          </div>

          <div className="preview-wrap mt-8">
            <div className="flex items-center gap-2 mb-2 text-white bg-slate-800 px-3 py-1 rounded-t-lg">
              <Printer className="w-4 h-4" /> معاينة الشهادة
            </div>
            {renderCertificate()}
          </div>
        </div>
      </div>

      <div className="fixed left-0 top-0 pointer-events-none opacity-[0.01] z-0">
        <div ref={ticketPrintRef} style={{ width: `${TICKET_WIDTH_MM}mm`, margin: 0, padding: 0 }}>
          <style type="text/css" media="print">
            {`
              @page { size: ${TICKET_WIDTH_MM}mm ${TICKET_HEIGHT_MM}mm; margin: 0; }
              html, body { width: ${TICKET_WIDTH_MM}mm !important; margin: 0 !important; padding: 0 !important; background-color: #10141c !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
              .ticket-print-page { width: ${TICKET_WIDTH_MM}mm !important; height: ${TICKET_HEIGHT_MM}mm !important; overflow: hidden !important; break-after: page !important; page-break-after: always !important; }
              .ticket-print-page:last-child { break-after: auto !important; page-break-after: auto !important; }
              .ticket-sheet { width: ${TICKET_WIDTH_MM}mm !important; height: ${TICKET_HEIGHT_MM}mm !important; border: none !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
            `}
          </style>
          <div className="ticket-print-page" style={{ width: `${TICKET_WIDTH_MM}mm`, height: `${TICKET_HEIGHT_MM}mm`, overflow: 'hidden', margin: 0, padding: 0 }}>
            {renderTicketFront('qr-code-canvas-export')}
          </div>
          <div className="ticket-print-page" style={{ width: `${TICKET_WIDTH_MM}mm`, height: `${TICKET_HEIGHT_MM}mm`, overflow: 'hidden', margin: 0, padding: 0 }}>
            {renderTicketBack()}
          </div>
        </div>
        <div ref={certificatePrintRef} style={{ width: '297mm', margin: 0, padding: 0 }}>
          <style type="text/css" media="print">
            {`
              @page { size: 297mm 210mm; margin: 0; }
              html, body { width: 297mm !important; height: 210mm !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background-color: #111 !important; }
              .certificate-sheet { width: 297mm !important; height: 210mm !important; border: none !important; border-radius: 0 !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
            `}
          </style>
          <div style={{ width: '297mm', height: '210mm', overflow: 'hidden', margin: 0, padding: 0 }}>
            {renderCertificate()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IDCard;
