import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAuth } from '../../context/AuthContext';
import Register from './Register';

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams('role=hospital_admin')]
}));

test('Postgres public registration offers only patient identity despite a privileged URL role', () => {
  useAuth.mockReturnValue({ authBackend: 'postgres', register: jest.fn() });
  const markup = renderToStaticMarkup(<Register />);
  expect(markup).toContain('Patient Account');
  expect(markup).toContain('Min. 12 characters');
  expect(markup).not.toContain('Hospital / Clinic');
  expect(markup).not.toContain('Clinical Doctor');
  expect(markup).not.toContain('Researcher / Buyer');
});

test('explicit legacy mode preserves its role choices and password form', () => {
  useAuth.mockReturnValue({ authBackend: 'legacy', register: jest.fn() });
  const markup = renderToStaticMarkup(<Register />);
  expect(markup).toContain('Hospital / Clinic Account');
  expect(markup).toContain('Clinical Doctor');
  expect(markup).toContain('Researcher / Buyer');
  expect(markup).toContain('Min. 6 characters');
});

test('unknown backend mode cannot expose a registration form or privileged role', () => {
  useAuth.mockReturnValue({ authBackend: null, register: jest.fn() });
  const markup = renderToStaticMarkup(<Register />);
  expect(markup).toContain('Registration is temporarily unavailable');
  expect(markup).not.toContain('<form');
  expect(markup).not.toContain('Hospital / Clinic');
});
