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

  const backConfig: Record<string, { label: string; date: string }> = {
    Minya: { label: 'EL - Minya Governorate', date: 'MAY 1st 2026' },
    Asyut: { label: 'Assiut Governorate', date: 'MAY 3rd 2026' },
    Sohag: { label: 'Sohag Governorate', date: 'MAY 5th 2026' },
    Qena: { label: 'Qena Governorate', date: 'MAY 7th 2026' }
  };

  const getClassStyle = (seatClass?: string) => {
    if (seatClass === 'A') return 'bg-[#D4AF7A] text-black';
    if (seatClass === 'B') return 'bg-[#D8D8D8] text-black';
    return 'bg-[#101010] text-white border border-[#777]';
  };

  const parseTableFromBarcode = (barcode?: string | null) => {
    const value = String(barcode || '');
    const match = value.match(/-T(\d+)-/i);
    return match ? match[1] : '-';
  };

  const renderTicketFront = () => {
    if (!attendee) return null;
    return (
      <div className="ticket-sheet bg-[#060b14] text-white border border-[#2b2f3a] rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 pt-3 flex justify-between items-center text-xs text-white/70">
          <span className="font-semibold">SA</span>
          <span className="font-semibold">Educon academy</span>
        </div>
        <div className="px-6 mt-3">
          <div className="w-full h-[190px] rounded-2xl border-4 border-[#D4AF7A] bg-white overflow-hidden">
            {attendee.profile_photo_url ? (
              <img src={attendee.profile_photo_url} alt={attendee.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">Photo</div>
            )}
          </div>
        </div>
        <div className="px-6 mt-2">
          <div className="h-7 rounded-md bg-[#0b1220] border border-[#1f2839] flex items-center justify-center text-[13px] font-semibold">
            {(attendee.full_name_en || attendee.full_name).toUpperCase()}
          </div>
        </div>
        <div className="px-6 mt-2 text-[14px] text-[#D4AF7A] text-center">Position: {attendee.job_title || 'Participant'}</div>
        <div className="px-6 mt-2 text-center">
          <div className="text-4xl leading-9 font-extrabold tracking-wide">MEGA SALES</div>
          <div className="text-4xl leading-9 font-extrabold tracking-wide">HACKERS</div>
          <div className="text-sm mt-1 text-white/80">BY SALAH ABO ELMAGD</div>
        </div>
        <div className="mt-3 flex justify-center">
          <div className="bg-white p-2 rounded">
            <QRCodeSVG value={attendee.qr_code || attendee.id} size={78} />
          </div>
        </div>
        <div className="mt-2 flex justify-center">
          <div className={`px-6 py-1 rounded-full text-[20px] font-black tracking-wide ${getClassStyle(attendee.seat_class)}`}>
            CLASS [{attendee.seat_class}]
          </div>
        </div>
        <div className="mt-2 px-7 text-[15px] leading-5 text-[#d9d9d9]">
          <div>Wave num : {attendee.seat_class || '-'}</div>
          <div>Table num : {parseTableFromBarcode(attendee.barcode)}</div>
          <div>Seat num : {attendee.seat_number || '-'}</div>
        </div>
        <div className="mt-auto mb-3 flex justify-center">
          {attendee.barcode ? (
            <Barcode value={attendee.barcode} width={1.2} height={34} displayValue={false} margin={0} />
          ) : (
            <span className="text-xs text-white/40">NO BARCODE</span>
          )}
        </div>
      </div>
    );
  };

  const renderTicketBack = () => {
    if (!attendee) return null;
    const cfg = backConfig[normalizeGovernorate(attendee.governorate)] || backConfig.Minya;
    return (
      <div className="ticket-sheet bg-[#070d17] text-white border border-[#2b2f3a] rounded-xl overflow-hidden flex flex-col">
        <div className="px-6 pt-4 flex justify-between items-center text-white/85">
          <span className="text-2xl font-semibold">SA</span>
          <span className="text-sm font-semibold">Educon academy</span>
        </div>
        <div className="mt-3 px-8 flex justify-center">
          <div className="w-[300px] h-[360px] rounded-xl bg-gradient-to-b from-[#111827] to-[#1f2937] flex items-center justify-center overflow-hidden">
            {attendee.profile_photo_url ? (
              <img src={attendee.profile_photo_url} alt={attendee.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white/50">Profile</span>
            )}
          </div>
        </div>
        <div className="mt-5 h-[18px] bg-gradient-to-r from-[#8a6b48] to-[#2b2f36]" />
        <div className="px-8 mt-3 text-center">
          <div className="text-[58px] leading-[56px] font-black text-[#d8b186]">EDUCON</div>
          <div className="text-[46px] leading-[42px] font-black text-[#d8b186]">&</div>
          <div className="text-[56px] leading-[54px] font-black text-[#d8b186]">Salah Abo El Magd</div>
        </div>
        <div className="mt-auto px-8 pb-5 flex items-end justify-between text-[#e4bc8f]">
          <div className="text-left">
            <div className="text-4xl leading-4">⌖</div>
            <div className="text-[28px] leading-[32px] font-bold mt-3">{cfg.label}</div>
          </div>
          <div className="text-right">
            <div className="text-[58px] leading-7">⌗</div>
            <div className="text-[28px] leading-[32px] font-bold mt-3">{cfg.date}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderCertificate = () => {
    if (!attendee) return null;
    return (
      <div className="certificate-sheet bg-white text-[#1f1f1f] rounded-xl border border-gray-300 overflow-hidden p-12 flex flex-col items-center justify-center text-center">
        <div className="w-full border-2 border-[#c7a57a] rounded-xl p-10">
          <div className="text-sm tracking-[0.3em] text-gray-500">EDUCON ACADEMY</div>
          <h1 className="mt-4 text-5xl font-black text-[#6f4f2f]">CERTIFICATE</h1>
          <div className="mt-2 text-lg text-gray-700">OF ACHIEVEMENT</div>
          <div className="mt-8 text-lg text-gray-500">This certificate is proudly presented to</div>
          <div className="mt-3 text-4xl font-bold text-[#2d2d2d]">{(attendee.full_name_en || attendee.full_name).toUpperCase()}</div>
          <div className="mt-8 text-lg leading-8 text-gray-700 max-w-4xl mx-auto">
            Your hard work, dedication, and commitment to learning have enabled you to unlock this milestone, and we are honored to recognize your accomplishment.
          </div>
          <div className="mt-10 flex justify-between items-center text-sm text-gray-500">
            <span>Educon & Salah Abo El Magd</span>
            <span>2026</span>
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
        .ticket-sheet { width: 8.5cm; height: 14cm; }
        .certificate-sheet { width: 29.7cm; height: 21cm; }
        @media print {
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
        <div className="scale-[0.85] origin-top">
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
