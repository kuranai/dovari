import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('Dovari app shell', () => {
  it('renders the workspace welcome content', () => {
    render(<App />);

    const heading = screen.getByRole('heading', { name: 'Your knowledge base starts here.' });
    const homeLink = screen.getByRole('link', { name: 'Dovari home' });

    expect(heading).toBeTruthy();
    expect(homeLink.getAttribute('href')).toBe('/');
  });
});
