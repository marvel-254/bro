import { truncate, formatRelativeTime, generateId, classNames, debounce } from '../utils';

describe('truncate', () => {
  it('returns the original string when within maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns the original string when exactly maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when exceeding maxLength', () => {
    expect(truncate('hello world', 6)).toBe('hello\u2026');
  });

  it('truncates a long string correctly', () => {
    const long = 'abcdefghijklmnopqrstuvwxyz';
    expect(truncate(long, 10)).toBe('abcdefghi\u2026');
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns unique values across calls', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });

  it('produces an 8-character id', () => {
    expect(generateId().length).toBe(8);
  });
});

describe('classNames', () => {
  it('joins all truthy values', () => {
    expect(classNames('a', 'b', 'c')).toBe('a b c');
  });

  it('filters out falsy values', () => {
    expect(classNames('a', false, 'b', undefined, '', 'c')).toBe('a b c');
  });

  it('returns empty string for all falsy', () => {
    expect(classNames(false, undefined, '')).toBe('');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "just now" for times under 60 seconds', () => {
    jest.setSystemTime(new Date('2026-09-14T06:49:56.000Z').getTime());
    expect(formatRelativeTime('2026-09-14T06:49:30.000Z')).toBe('just now');
  });

  it('returns minutes ago for times under 1 hour', () => {
    jest.setSystemTime(new Date('2026-09-14T06:49:56.000Z').getTime());
    expect(formatRelativeTime('2026-09-14T06:30:00.000Z')).toBe('19m ago');
  });

  it('returns hours ago for times under 1 day', () => {
    jest.setSystemTime(new Date('2026-09-14T06:49:56.000Z').getTime());
    expect(formatRelativeTime('2026-09-14T02:00:00.000Z')).toBe('4h ago');
  });

  it('returns days ago for times past 1 day', () => {
    jest.setSystemTime(new Date('2026-09-14T06:49:56.000Z').getTime());
    expect(formatRelativeTime('2026-09-11T06:00:00.000Z')).toBe('3d ago');
  });
});

describe('debounce', () => {
  it('calls the function after the delay', () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('debounces multiple calls into a single invocation', () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
