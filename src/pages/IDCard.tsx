import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Attendee } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import { useReactToPrint } from 'react-to-print';
import { Printer, ArrowLeft } from 'lucide-react';

const IDCard: React.FC = () => {
  const params = useParams();
  const id = params.id;
  const navigate = useNavigate();
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [loading, setLoading] = useState(true);
  const componentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
  });

  const fetchAttendee = useCallback(async (attendeeId: string) => {
    try {
      // Use the new single attendee endpoint
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

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!attendee) return <div className="p-8 text-center">Attendee not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6 flex items-center justify-between no-print">
        <button
          onClick={() => navigate('/attendees')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to List
        </button>
        <button
          onClick={() => handlePrint()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Printer className="h-5 w-5 mr-2" />
          Print ID Card
        </button>
      </div>

      <div className="flex justify-center">
        {/* ID Card Container - Targeted for Print */}
        <div 
          ref={componentRef} 
          className="w-[350px] h-[550px] bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg relative flex flex-col items-center text-center print:border-0 print:shadow-none"
          style={{ pageBreakAfter: 'always' }}
        >
          {/* Header/Background Pattern */}
          <div className="absolute top-0 w-full h-32 bg-indigo-600 z-0"></div>
          
          {/* Content */}
          <div className="z-10 mt-12 w-full px-6 flex flex-col items-center h-full">
            <div className="w-32 h-32 bg-white rounded-full p-2 shadow-md flex items-center justify-center mb-4">
              {/* Logo or Initial */}
              <span className="text-4xl font-bold text-indigo-600">
                {attendee.full_name.charAt(0)}
              </span>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 leading-tight mb-1">
              {attendee.full_name}
            </h2>
            <p className="text-indigo-600 font-medium mb-4">{attendee.governorate}</p>

            <div className="w-full border-t border-b border-gray-100 py-4 mb-4 grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 uppercase tracking-wide">Class</span>
                <span className="text-xl font-bold text-gray-800">{attendee.seat_class}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 uppercase tracking-wide">Status</span>
                <span className={`text-xl font-bold capitalize ${attendee.status === 'registered' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {attendee.status}
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center space-y-4 w-full">
              {/* QR Code */}
              {attendee.qr_code && (
                <div className="p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                   <QRCodeSVG value={attendee.qr_code} size={100} />
                   <p className="text-[10px] text-gray-400 mt-1">{attendee.qr_code}</p>
                </div>
              )}

              {/* Barcode */}
              {attendee.barcode && (
                 <div className="w-full flex justify-center overflow-hidden">
                   <Barcode value={attendee.barcode} width={1.5} height={40} fontSize={10} displayValue={true} />
                 </div>
              )}
            </div>
            
            <div className="w-full py-4 mt-auto">
               <p className="text-xs text-gray-400">Event Management System</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IDCard;
