import React from 'react'

export const ConflictingComponent: React.FC = () => {
    return (
        <div>
            {/* This should NOT be detected as a conflict for "Loading" class */}
            <div className="AddOnsConfirmModal--Loading">Loading modal...</div>
            <div className="btn-Loading-state">Button loading state</div>
            <div className="Loading-spinner">Should be detected as conflict</div>
            <div className="spinner-Loading">Should be detected as conflict</div>

            {/* Template literals */}
            <div className={`AddOnsConfirmModal--Loading active`}>Template literal</div>
            <div className={`Loading-active`}>Should be detected</div>

            {/* classNames utility */}
            <div className={classNames('AddOnsConfirmModal--Loading', 'active')}>ClassNames call</div>
            <div className={classNames('Loading', 'active')}>Should be detected</div>
        </div>
    )
}
