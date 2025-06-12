// @ts-nocheck
import React from 'react'
import './ComponentWithCssImport.css'

export const ComponentWithCssImport = () => {
    return (
        <div className="test-class another-class">
            <p className="nested-class">Content with CSS classes</p>
        </div>
    )
} 