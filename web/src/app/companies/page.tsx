import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getAllCompanies, getActiveCompanyId } from '@/lib/company';
import { CompaniesClient } from './CompaniesClient';

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
