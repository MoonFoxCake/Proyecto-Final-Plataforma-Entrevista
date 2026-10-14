const crypto = require('crypto');
const {
  ALPHABET, generateAccessCode, normalizeAccessCode, isWellFormedAccessCode, hashAccessCode, endOfAppointmentDay, formatAccessCode,
  entryWindow, entryWindowState,
} = require('../../../src/utils/accessCode');

describe('access codes', () => {
  test('are 10 characters in two groups, without ambiguous characters', () => {
    expect(ALPHABET).not.toMatch(/[01ILO]/);
    for (let index = 0; index < 200; index += 1) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
    }
  });

  test('use the cryptographic random generator', () => {
    const spy = jest.spyOn(crypto, 'randomInt');
    generateAccessCode();
    expect(spy).toHaveBeenCalledTimes(10);
    expect(spy).toHaveBeenCalledWith(ALPHABET.length);
    spy.mockRestore();
  });

  test('a batch of codes has no repeats', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateAccessCode()));
    expect(codes.size).toBe(2000);
  });

  test('typing is forgiving with case, spaces and dashes', () => {
    expect(normalizeAccessCode(' abcde-fgh23 ')).toBe('ABCDEFGH23');
    expect(isWellFormedAccessCode('k7m2p 9qx4r')).toBe(true);
    expect(isWellFormedAccessCode('K7M2P-9QX4')).toBe(false);
    expect(isWellFormedAccessCode('K7M2P-9QX4O')).toBe(false); // O is not in the alphabet
    expect(formatAccessCode('k7m2p9qx4r')).toBe('K7M2P-9QX4R');
  });

  test('are stored as an HMAC that depends on the server secret', () => {
    const pepper = 'p'.repeat(32);
    const hash = hashAccessCode('K7M2P-9QX4R', pepper);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessCode('k7m2p 9qx4r', pepper)).toBe(hash);
    expect(hashAccessCode('K7M2P-9QX4R', 'q'.repeat(32))).not.toBe(hash);
    expect(hash).not.toBe(crypto.createHash('sha256').update('K7M2P9QX4R').digest('hex'));
    expect(() => hashAccessCode('K7M2P-9QX4R', undefined)).toThrow('ACCESS_CODE_PEPPER');
  });

  test('expire at the end of the appointment day in Guatemala', () => {
    // 8:00 a. m. and 11:30 p. m. in Guatemala (UTC−6) are the same day there.
    expect(endOfAppointmentDay(new Date('2026-11-05T14:00:00.000Z'))).toEqual(new Date('2026-11-06T05:59:59.999Z'));
    expect(endOfAppointmentDay(new Date('2026-11-06T05:30:00.000Z'))).toEqual(new Date('2026-11-06T05:59:59.999Z'));
  });

  test('the entry window opens at the start of the appointment and lasts its minutes (30 by default)', () => {
    const startsAt = new Date('2026-11-05T14:00:00.000Z');
    expect(entryWindow({ startsAt })).toEqual({ opensAt: startsAt, closesAt: new Date('2026-11-05T14:30:00.000Z'), minutes: 30 });
    expect(entryWindow({ startsAt, entryWindowMinutes: 15 }).closesAt).toEqual(new Date('2026-11-05T14:15:00.000Z'));

    const appointment = { startsAt, entryWindowMinutes: 15 };
    expect(entryWindowState(appointment, new Date('2026-11-05T13:59:59.999Z'))).toBe('PENDING');
    expect(entryWindowState(appointment, startsAt)).toBe('OPEN');
    expect(entryWindowState(appointment, new Date('2026-11-05T14:14:59.999Z'))).toBe('OPEN');
    expect(entryWindowState(appointment, new Date('2026-11-05T14:15:00.000Z'))).toBe('CLOSED');
  });
});
