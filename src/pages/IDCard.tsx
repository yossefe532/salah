import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
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
    A: '/templates/ticket-front-a.png',
    B: '/templates/ticket-front-b.png',
    C: '/templates/ticket-front-c.png'
  };

  const backTemplateByGovernorate: Record<string, string> = {
    Minya: '/templates/ticket-back-minya.png',
    Asyut: '/templates/ticket-back-asyut.png',
    Sohag: '/templates/ticket-back-sohag.png',
    Qena: '/templates/ticket-back-qena.png'
  };

  const certificateTemplate = '/templates/certificate-template.png';

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
    const fullName = attendee.full_name_en || attendee.full_name;
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
        <div className="absolute z-10 w-full text-center flex flex-col justify-center items-center" style={{ top: '44%', height: '5%' }}>
          <div className="text-[18px] font-extrabold tracking-wide uppercase text-[#c7a57a] px-4">
            {fullName}
          </div>
        </div>

        {/* Position - Placed next to the "Position :" label in template */}
        <div className="absolute z-10" style={{ top: '50.3%', left: '58%', transform: 'translateY(-50%)' }}>
          <div className="text-[14px] font-bold text-white whitespace-nowrap">
            {attendee.job_title || 'Participant'}
          </div>
        </div>

        {/* Barcode - Centered below "BY SALAH ABO ELMAGD" */}
        <div className="absolute z-10 w-full flex justify-center" style={{ top: '75%' }}>
          {attendee.barcode ? (
            <div className="bg-white p-1 rounded-sm scale-90">
               <Barcode value={attendee.barcode} width={1.2} height={30} displayValue={false} margin={0} background="#fff" lineColor="#000" />
            </div>
          ) : (
            <div className="h-[30px]" />
          )}
        </div>

        {/* Wave / Table Num Value */}
        <div className="absolute z-10" style={{ top: '88.3%', left: '55%', transform: 'translateY(-50%)' }}>
          <div className="text-[15px] font-bold text-white">
            {tableNum ?? attendee.seat_class ?? '-'}
          </div>
        </div>

        {/* Seat Num Value */}
        <div className="absolute z-10" style={{ top: '92.3%', left: '55%', transform: 'translateY(-50%)' }}>
          <div className="text-[15px] font-bold text-white">
            {attendee.seat_number ?? '-'}
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
    const fullName = attendee.full_name_en || attendee.full_name;
    return (
      <div className="certificate-sheet relative overflow-hidden bg-[#111]">
        <div className="absolute inset-0 flex items-center justify-center text-gray-800 text-sm border border-gray-800">صورة القالب مفقودة ({certificateTemplate})</div>
        <img src={certificateTemplate} alt="certificate-template" onError={handleImageError} className="absolute inset-0 h-full w-full object-cover z-0 transition-opacity duration-200" />
        
        {/* Name - Placed exactly in the empty space between the two lines of text */}
        <div className="absolute z-10 w-full text-center flex flex-col justify-center items-center" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          <div className="text-[52px] font-bold tracking-wider" style={{ color: '#dcb586', fontFamily: 'serif', letterSpacing: '0.05em' }}>
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

      <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md no-print text-yellow-800 text-sm shadow-sm">
        <h3 className="font-bold text-lg mb-2 text-red-600 flex items-center">
          <span className="mr-2">⚠️</span> تنبيه هام جداً (الصور لا تظهر؟)
        </h3>
        <p className="mb-2 font-semibold">الصور التي أرسلتها في المحادثة لا تدخل في ملفات الكود تلقائياً.</p>
        <p className="mb-2">لتظهر القوالب بشكل صحيح وتختفي الرسالة السوداء، <strong>يجب عليك يدوياً</strong> وضع ملفات الصور الخاصة بك في مجلد <code>public/templates/</code> داخل المشروع بالأسماء التالية بالضبط:</p>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono bg-white p-3 rounded border border-yellow-200" dir="ltr">
          <div className="text-right">ticket-front-a.png</div>
          <div className="text-right">ticket-front-b.png</div>
          <div className="text-right">ticket-front-c.png</div>
          <div className="text-right">ticket-back-minya.png</div>
          <div className="text-right">ticket-back-asyut.png</div>
          <div className="text-right">ticket-back-sohag.png</div>
          <div className="text-right">ticket-back-qena.png</div>
          <div className="text-right">certificate-template.png</div>
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
