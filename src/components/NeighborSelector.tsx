import React, { useEffect, useMemo, useState } from 'react';
import { Attendee } from '../types';
import { api } from '../lib/api';

interface NeighborSelectorProps {
  attendees: Attendee[];
  currentAttendeeId?: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const NeighborSelector: React.FC<NeighborSelectorProps> = ({ attendees, currentAttendeeId, selectedIds, onChange }) => {
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<Attendee[]>([]);
  const [knownSelected, setKnownSelected] = useState<Record<string, Attendee>>({});

  const normalizedSelected = useMemo(
    () => [...new Set(selectedIds.filter((id) => id && id !== currentAttendeeId))],
    [currentAttendeeId, selectedIds]
  );

  useEffect(() => {
    const keyword = query.trim();
    if (keyword.length < 2) {
      setRemoteResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(`/attendees?lite=1&search_mode=strict&limit=30&q=${encodeURIComponent(keyword)}`);
        if (cancelled) return;
        const rows = Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []);
        setRemoteResults(rows as Attendee[]);
      } catch {
        if (!cancelled) setRemoteResults([]);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const next: Record<string, Attendee> = { ...knownSelected };
    [...attendees, ...remoteResults].forEach((attendee) => {
      if (attendee?.id) next[attendee.id] = attendee;
    });
    // Clean stale selected entries only when they are no longer selected.
    Object.keys(next).forEach((id) => {
      if (!normalizedSelected.includes(id) && !attendees.find((a) => a.id === id) && !remoteResults.find((a) => a.id === id)) {
        delete next[id];
      }
    });
    setKnownSelected(next);
  }, [attendees, remoteResults, normalizedSelected]);

  const filteredAttendees = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const localMatches = attendees
      .filter((attendee) => attendee.id !== currentAttendeeId && !normalizedSelected.includes(attendee.id))
      .filter((attendee) => {
        if (!keyword) return true;
        const haystack = [
          attendee.full_name,
          attendee.full_name_en,
          attendee.phone_primary,
          attendee.phone_secondary
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 8);

    if (!keyword) return localMatches;

    const merged = new Map<string, Attendee>();
    [...localMatches, ...remoteResults].forEach((attendee) => {
      if (!attendee?.id) return;
      if (attendee.id === currentAttendeeId) return;
      if (normalizedSelected.includes(attendee.id)) return;
      merged.set(attendee.id, attendee);
    });
    return Array.from(merged.values()).slice(0, 12);
  }, [attendees, currentAttendeeId, normalizedSelected, query, remoteResults]);

  const selectedAttendees = useMemo(
    () => normalizedSelected
      .map((id) => attendees.find((attendee) => attendee.id === id) || knownSelected[id])
      .filter(Boolean) as Attendee[],
    [attendees, knownSelected, normalizedSelected]
  );

  const addNeighbor = (id: string) => {
    const candidate = filteredAttendees.find((attendee) => attendee.id === id) || remoteResults.find((attendee) => attendee.id === id);
    if (candidate?.id) {
      setKnownSelected((prev) => ({ ...prev, [candidate.id]: candidate }));
    }
    onChange([...normalizedSelected, id]);
    setQuery('');
  };

  const removeNeighbor = (id: string) => {
    onChange(normalizedSelected.filter((item) => item !== id));
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        placeholder="ابحث بالاسم أو الهاتف"
      />
      
      {selectedAttendees.length > 0 && (
         <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md text-xs">
           <strong className="block mb-1">ملاحظة هامة للتسكين المتجاور:</strong>
           بما أن هذه المجموعة تتكون من {selectedAttendees.length + 1} أشخاص (بما فيهم الشخص الحالي)، 
           يرجى الانتباه أثناء التسكين باختيار {selectedAttendees.length + 1} مقاعد متجاورة من نفس الترابيزة أو الصف.
           <br/>
           <em>نصيحة: يفضل حجز "طاولة كاملة" إذا كان العدد كبير، أو اختيار أرقام متتالية يدوياً.</em>
         </div>
      )}

      {selectedAttendees.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedAttendees.map((attendee) => (
            <button
              key={attendee.id}
              type="button"
              onClick={() => removeNeighbor(attendee.id)}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
            >
              <span>{attendee.full_name}</span>
              <span className="text-indigo-400">×</span>
            </button>
          ))}
        </div>
      ) : null}

      {filteredAttendees.length > 0 ? (
        <div className="max-h-52 overflow-auto rounded-md border border-gray-200 bg-white">
          {filteredAttendees.map((attendee) => (
            <button
              key={attendee.id}
              type="button"
              onClick={() => addNeighbor(attendee.id)}
              className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-right text-sm hover:bg-gray-50 last:border-b-0"
            >
              <span className="font-medium text-gray-800">{attendee.full_name}</span>
              <span className="text-xs text-gray-500">{attendee.phone_primary}</span>
            </button>
          ))}
        </div>
      ) : query ? (
        <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500">
          لا توجد نتائج مطابقة
        </div>
      ) : null}
    </div>
  );
};

export default NeighborSelector;
