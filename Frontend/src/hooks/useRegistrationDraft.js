import { useCallback, useEffect, useRef, useState } from 'react';
import registrationDraftService from '../services/registrationDraftService';

const storageKey = (role) => `wbi_reg_draft_${role}`;
const cacheKey = (role) => `wbi_reg_draft_cache_${role}`;

function genUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function genObjectId() {
  const hex = Date.now().toString(16) + Math.random().toString(16).slice(2);
  return hex.padEnd(24, '0').slice(0, 24);
}

/**
 * Persistent registration draft: localStorage draftKey + debounced server autosave.
 */
export default function useRegistrationDraft(role, options = {}) {
  const debounceMs = options.debounceMs ?? 1200;
  const [draftKey] = useState(() => {
    try {
      const existing = localStorage.getItem(storageKey(role));
      if (existing) return existing;
      const id = genUuid();
      localStorage.setItem(storageKey(role), id);
      return id;
    } catch {
      return genUuid();
    }
  });

  const [entityId, setEntityId] = useState(() => {
    try {
      const cache = JSON.parse(localStorage.getItem(cacheKey(role)) || 'null');
      if (cache?.entityId) return cache.entityId;
    } catch { /* ignore */ }
    return genObjectId();
  });

  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(null);
  const timerRef = useRef(null);
  const latestRef = useRef({});

  const restore = useCallback(async () => {
    let localCache = null;
    try {
      localCache = JSON.parse(localStorage.getItem(cacheKey(role)) || 'null');
    } catch { /* ignore */ }

    try {
      const res = await registrationDraftService.get(draftKey, role);
      if (res.success && res.data) {
        if (res.data.entityId) setEntityId(res.data.entityId);
        setRestored(res.data);
        setReady(true);
        return res.data;
      }
    } catch {
      /* fall through to local */
    }

    if (localCache) {
      if (localCache.entityId) setEntityId(localCache.entityId);
      setRestored(localCache);
      setReady(true);
      return localCache;
    }

    setReady(true);
    return null;
  }, [draftKey, role]);

  useEffect(() => {
    restore();
  }, [restore]);

  const saveNow = useCallback(
    async ({ formData, currentStep, completedSteps, phone, email, extraPayload } = {}) => {
      const payload = {
        ...(formData || {}),
        ...(extraPayload || {})
      };
      // Strip secrets client-side too
      delete payload.password;
      delete payload.otp;
      delete payload.aadhaarOtp;

      const body = {
        role,
        draftKey,
        entityId,
        phone: phone || formData?.phone || formData?.mobile || undefined,
        email: email || formData?.email || undefined,
        currentStep,
        completedSteps,
        payload
      };

      latestRef.current = body;

      try {
        localStorage.setItem(
          cacheKey(role),
          JSON.stringify({
            ...body,
            entityId,
            updatedAt: new Date().toISOString()
          })
        );
      } catch { /* quota */ }

      try {
        const res = await registrationDraftService.upsert(body);
        if (res.success && res.data?.entityId) {
          setEntityId(res.data.entityId);
        }
        return res;
      } catch (err) {
        console.warn('[useRegistrationDraft] save failed', err?.message || err);
        return { success: false, error: err };
      }
    },
    [role, draftKey, entityId]
  );

  const scheduleSave = useCallback(
    (snapshot) => {
      latestRef.current = { ...latestRef.current, ...snapshot };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveNow(latestRef.current);
      }, debounceMs);
    },
    [saveNow, debounceMs]
  );

  const clearDraft = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await registrationDraftService.remove(draftKey, role);
    } catch { /* ignore */ }
    try {
      localStorage.removeItem(storageKey(role));
      localStorage.removeItem(cacheKey(role));
    } catch { /* ignore */ }
  }, [draftKey, role]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    draftKey,
    entityId,
    setEntityId,
    ready,
    restored,
    restore,
    scheduleSave,
    saveNow,
    clearDraft
  };
}

export { genObjectId, storageKey, cacheKey };
