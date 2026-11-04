import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getAllCompanies, getActiveCompanyId } from '@/lib/company';
import { CompaniesClient } from './CompaniesClient';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.companies') }; }

export default async function CompaniesPage() {
  const user = await requirePageAccess();
  const companies = getAllCompanies();
  const activeCompanyId = await getActiveCompanyId();

  return (
    <CompaniesClient 
      initialCompanies={companies} 
      activeCompanyId={activeCompanyId}
      isAdmin={user.role === 'admin'}
    />
  );
}
