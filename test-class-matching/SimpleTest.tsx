import React from 'react'

export const SimpleTest: React.FC = () => {
    return (
        <div>
            {/* These should NOT match "Loading" */}
            <div className="AddOnsConfirmModal--Loading">Should not match</div>
            <div className="btn-Loading-state">Should not match</div>

            {/* These SHOULD match "Loading" */}
            <div className="Loading">Should match</div>
            <div className="Loading active">Should match</div>
            <div className="active Loading">Should match</div>
            <div className="active Loading disabled">Should match</div>
        </div>
    )
}
