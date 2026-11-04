import { useCallback, useEffect, useState } from 'react';
import { errMsg } from '../services/api';

/** Small data-loading hook for admin pages. */
export default function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    return fetcher()
      .then((data) => setState({ data, error: '', loading: false }))
      .catch((err) => setState({ data: null, error: errMsg(err, 'Could not load data.'), loading: false }));
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
