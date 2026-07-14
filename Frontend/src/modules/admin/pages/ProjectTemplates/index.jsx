import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TemplateList from './TemplateList';
import TemplateForm from './TemplateForm';
// import FormBuilder from './FormBuilder'; // To be implemented

export default function ProjectTemplatesRouter() {
  return (
    <Routes>
      <Route index element={<TemplateList />} />
      <Route path="create" element={<TemplateForm />} />
      <Route path=":id/edit" element={<TemplateForm />} />
      {/* <Route path=":id/forms" element={<FormBuilder />} /> */}
    </Routes>
  );
}
