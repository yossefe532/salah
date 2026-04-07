import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import { Printer, ArrowLeft, Ticket, ScanFace, FileBadge2 } from 'lucide-react';

const IDCard: React.FC = () => {
  const params = useParams();
  const id = params.id;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewMode = (searchParams.get('template') || 'ticket') as 'ticket' | 'back' | 'certificate';
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [loading, setLoading] = useState(true);
  const ticketPrintRef = useRef<HTMLDivElement>(null);
  const certificatePrintRef = useRef<HTMLDivElement>(null);
  const previewModeRef = useRef<HTMLDivElement>(null);

  const fetchAttendee = useCallback(async (attendeeId: string) => {
    try {
      const data = await api.get(`/attendees/${attendeeId}`);
      setAttendee(data);
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

  const handlePrintTicket = useReactToPrint({
    contentRef: ticketPrintRef,
    documentTitle: attendee ? `ticket-${attendee.full_name}` : 'ticket',
    onAfterPrint: () => {
      markPrinted('ticket');
    }
  });

  const handlePrintCertificate = useReactToPrint({
    contentRef: certificatePrintRef,
    documentTitle: attendee ? `certificate-${attendee.full_name}` : 'certificate',
    onAfterPrint: () => {
      markPrinted('certificate');
    }
  });

  const normalizeGovernorate = (value?: string) => {
    const key = String(value || '').trim().toLowerCase();
    if (key.includes('minya') || key.includes('منيا')) return 'Minya';
    if (key.includes('asyut') || key.includes('assiut') || key.includes('أسيوط') || key.includes('اسيوط')) return 'Asyut';
    if (key.includes('sohag') || key.includes('سوهاج')) return 'Sohag';
    if (key.includes('qena') || key.includes('قنا')) return 'Qena';
    return 'Minya';
  };

  const frontTemplateByClass: Record<string, string> = {
    A: '/templates/ticket-front-a.jpg',
    B: '/templates/ticket-front-b.jpg',
    C: '/templates/ticket-front-c.jpg'
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
    if (name.length > 30) return '10.6px';
    if (name.length > 24) return '11.4px';
    if (name.length > 18) return '12.2px';
    return '13.28px';
  };

  const getJobTitleFontSize = (title: string) => {
    if (title.length > 22) return '11.2px';
    if (title.length > 16) return '12.2px';
    return '13.92px';
  };

  const getCertificateNameFontSize = (name: string) => {
    if (name.length > 28) return '28px';
    if (name.length > 22) return '31px';
    if (name.length > 18) return '34px';
    return '36.9px';
  };

  const parseTableFromSeatCode = (barcode?: string | null) => {
    const value = String(barcode || '');
    const match = value.match(/-T(\d+)-/i);
    return match ? Number(match[1]) : null;
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.style.opacity = '0';
  };

  const renderTicketFront = () => {
    if (!attendee) return null;
    const frontSrc = frontTemplateByClass[attendee.seat_class || 'C'] || frontTemplateByClass.C;
    const fullName = getDisplayName(attendee);
    const jobTitle = String(attendee.job_title || '').trim();
    const tableNum = parseTableFromSeatCode(attendee.barcode);
    return (
      <div className="ticket-sheet relative overflow-hidden bg-[#0a0a0a]">
        <div className="absolute inset-0 flex items-center justify-center text-gray-800 text-sm border border-gray-800">صورة القالب مفقودة ({frontSrc})</div>
        <img src={frontSrc} alt="ticket-front-template" onError={handleImageError} className="absolute inset-0 h-full w-full object-cover z-0 transition-opacity duration-200" />
        
        {/* Profile Photo - Top Box */}
        <div className="absolute z-10" style={{ top: '10.5%', left: '50%', transform: 'translateX(-50%)', width: '42%', aspectRatio: '1/1' }}>
          {attendee.profile_photo_url ? (
            <img src={attendee.profile_photo_url} alt={attendee.full_name} className="h-full w-full object-cover rounded-xl border-[3px] border-[#c7a57a]" />
          ) : (
            <div className="h-full w-full rounded-xl border-[3px] border-[#c7a57a] bg-white/10 flex items-center justify-center text-white/50 text-xs">صورة شخصية</div>
          )}
        </div>

        {/* Name - Gold Text Centered */}
        <div className="absolute z-10 flex justify-center" style={{ top: '46.2%', left: '50%', width: '72%', transform: 'translateX(-50%)' }}>
          <div
            className="font-bold uppercase text-[#c39d78] text-center"
            dir="ltr"
            style={{
              fontFamily: '"TT Runs Trial", sans-serif',
              fontSize: getTicketNameFontSize(fullName),
              lineHeight: '1',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%'
            }}
          >
            {fullName}
          </div>
        </div>

        {/* Position value only; label already exists in template */}
        {jobTitle ? (
          <div className="absolute z-10" style={{ top: '52.6%', left: '58.3%', width: '21%' }}>
            <div
              className="font-semibold text-[#e0d3c2]"
              dir="ltr"
              style={{
                fontFamily: '"TT Runs Trial", sans-serif',
                fontSize: getJobTitleFontSize(jobTitle),
                lineHeight: '1',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'left'
              }}
            >
              {jobTitle}
            </div>
          </div>
        ) : null}

        {/* QR Code - Centered on the QR placeholder */}
        <div className="absolute z-10 w-full flex justify-center" style={{ top: '63.2%' }}>
          {attendee.qr_code || attendee.id ? (
            <div className="bg-white p-[4px] rounded-[2px]">
               <QRCodeSVG value={attendee.qr_code || attendee.id} size={118} level="H" includeMargin={false} />
            </div>
          ) : (
            <div className="h-[118px]" />
          )}
        </div>

        {/* Wave value only; label already exists in template */}
        <div className="absolute z-10 flex justify-center" style={{ top: '84.9%', left: '50%', width: '58%', transform: 'translateX(-50%)' }}>
          <div className="font-bold text-[#e0d3c2]" dir="ltr" style={{ fontSize: '11.2px', lineHeight: '1', textAlign: 'center', whiteSpace: 'nowrap' }}>
            wave part num : {tableNum ?? attendee.seat_class ?? '-'}
          </div>
        </div>

        <div className="absolute z-10 flex justify-center" style={{ top: '88.8%', left: '50%', width: '58%', transform: 'translateX(-50%)' }}>
          <div className="font-bold text-[#e0d3c2]" dir="ltr" style={{ fontSize: '11.2px', lineHeight: '1', textAlign: 'center', whiteSpace: 'nowrap' }}>
            Seat num : {attendee.seat_number ?? '-'}
          </div>
        </div>
      </div>
    );
  };

  const renderTicketBack = () => {
    if (!attendee) return null;
    const key = normalizeGovernorate(attendee.governorate);
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
        
        <div className="absolute z-10 flex justify-center" style={{ top: '43.8%', left: '50%', width: '62%', transform: 'translate(-50%, -50%)' }}>
          <div
            className="font-bold text-center"
            dir="ltr"
            style={{
              color: '#f5efe7',
              fontFamily: 'Roboto, sans-serif',
              fontSize: getCertificateNameFontSize(fullName),
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

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!attendee) return <div className="p-8 text-center">Attendee not found</div>;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <style>{`
        .ticket-sheet { width: 8.5cm; height: 14cm; background: #10141c; }
        .certificate-sheet { width: 29.7cm; height: 21cm; background: #111; }
        .preview-wrap { transform-origin: top center; }
        @media (max-width: 768px) {
          .preview-wrap { transform: scale(0.7); }
        }
        @media print {
          @page { margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ticket-sheet { width: 8.5cm !important; height: 14cm !important; page-break-after: always; }
          .certificate-sheet { width: 29.7cm !important; height: 21cm !important; page-break-after: always; }
          .ticket-sheet, .certificate-sheet {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
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
        <button onClick={() => handlePrintTicket()} className="inline-flex items-center px-4 py-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
          <Printer className="h-4 w-4 ml-2" />
          طباعة التيكت
        </button>
        <button onClick={() => handlePrintTicket()} className="inline-flex items-center px-4 py-2 rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200">
          <Printer className="h-4 w-4 ml-2" />
          حفظ PDF للتيكت
        </button>
        <button onClick={() => handlePrintCertificate()} className="inline-flex items-center px-4 py-2 rounded-md text-white bg-emerald-600 hover:bg-emerald-700">
          <Printer className="h-4 w-4 ml-2" />
          طباعة الشهادة
        </button>
        <button onClick={() => handlePrintCertificate()} className="inline-flex items-center px-4 py-2 rounded-md text-emerald-700 bg-emerald-100 hover:bg-emerald-200">
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

      <div className="flex justify-center">
        <div ref={previewModeRef} className="preview-wrap">
          {previewMode === 'certificate' ? renderCertificate() : previewMode === 'back' ? renderTicketBack() : renderTicketFront()}
        </div>
      </div>

      <div className="absolute -left-[99999px] top-0">
        <div ref={ticketPrintRef}>
          {renderTicketFront()}
          <div style={{ pageBreakAfter: 'always' }} />
          {renderTicketBack()}
        </div>
        <div ref={certificatePrintRef}>
          {renderCertificate()}
        </div>
      </div>
    </div>
  );
};

export default IDCard;
