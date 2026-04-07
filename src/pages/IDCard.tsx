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

  const renderTicketFront = () => {
    if (!attendee) return null;
    const frontSrc = frontTemplateByClass[attendee.seat_class || 'C'] || frontTemplateByClass.C;
    const fullName = attendee.full_name_en || attendee.full_name;
    const tableNum = parseTableFromSeatCode(attendee.barcode);
    return (
      <div className="ticket-sheet relative overflow-hidden">
        <img src={frontSrc} alt="ticket-front-template" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute left-[42px] top-[275px] w-[412px] text-center text-[23px] font-bold tracking-wide text-[#dcb586] uppercase">
          {fullName}
        </div>
        <div className="absolute left-[58px] top-[334px] w-[380px] text-center text-[34px] leading-[34px] font-black text-[#ffffff]">
          Position: {attendee.job_title || 'Participant'}
        </div>
        <div className="absolute left-[184px] top-[458px] rounded-md bg-white p-2">
          <QRCodeSVG value={attendee.qr_code || attendee.id} size={120} />
        </div>
        <div className="absolute left-[138px] top-[660px] text-[31px] font-black text-[#e5e5e5]">
          Wave num : {attendee.seat_class || '-'}
        </div>
        <div className="absolute left-[138px] top-[702px] text-[31px] font-black text-[#e5e5e5]">
          Table num : {tableNum ?? '-'}
        </div>
        <div className="absolute left-[138px] top-[744px] text-[31px] font-black text-[#e5e5e5]">
          Seat num : {attendee.seat_number ?? '-'}
        </div>
        <div className="absolute left-[110px] top-[595px] w-[280px]">
          {attendee.barcode ? (
            <Barcode value={attendee.barcode} width={1.1} height={40} displayValue={false} margin={0} />
          ) : (
            <div className="h-[40px]" />
          )}
        </div>
        {attendee.profile_photo_url && (
          <div className="absolute left-[101px] top-[99px] h-[165px] w-[294px] overflow-hidden rounded-[14px]">
            <img src={attendee.profile_photo_url} alt={attendee.full_name} className="h-full w-full object-cover" />
          </div>
        )}
      </div>
    );
  };

  const renderTicketBack = () => {
    if (!attendee) return null;
    const key = normalizeGovernorate(attendee.governorate);
    const backSrc = backTemplateByGovernorate[key] || backTemplateByGovernorate.Minya;
    return (
      <div className="ticket-sheet relative overflow-hidden">
        <img src={backSrc} alt="ticket-back-template" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    );
  };

  const renderCertificate = () => {
    if (!attendee) return null;
    const fullName = attendee.full_name_en || attendee.full_name;
    return (
      <div className="certificate-sheet relative overflow-hidden">
        <img src={certificateTemplate} alt="certificate-template" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute left-0 right-0 top-[43.4%] text-center text-[56px] font-extrabold text-white">
          {fullName}
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
