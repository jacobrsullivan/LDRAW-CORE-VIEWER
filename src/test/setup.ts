import '@testing-library/jest-dom'
import { vi } from 'vitest';

// Mock the uuid library
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

// Store the original fetch
const originalFetch = global.fetch;

// Mock fetch for all tests
global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
  const urlStr = url.toString();
  console.log(`Mock fetch called with URL: ${urlStr}`);
  
  // For LDConfig.ldr requests, return a valid response
  if (urlStr.includes('LDConfig.ldr')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('0 LDraw.org Configuration File\n0 Name: LDConfig.ldr')
    } as Response);
  }
  
  // For part files, return valid content
  if (urlStr.includes('.dat')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(`0 Part\n0 Name: ${urlStr.split('/').pop()}\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 box.dat`)
    } as Response);
  }
  
  // Default response for other URLs
  return Promise.resolve({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: () => Promise.resolve('Not found')
  } as Response);
});

// Add a cleanup hook to restore the original fetch
if (typeof afterAll === 'function') {
  afterAll(() => {
    global.fetch = originalFetch;
  });
}

// Add any global setup code for tests here 