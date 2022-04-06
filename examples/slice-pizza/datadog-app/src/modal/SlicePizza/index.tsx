import { init } from '@datadog/ui-extensions-sdk';
import React, { useState } from 'react';
import ReactDOM from 'react-dom';

import Token from '../../types/Token';
import User from '../../types/User';

import { OrderSuccess } from '../../components/OrderSuccess';
import { OrderSummary } from '../../components/OrderSummary';
import { SignInForm } from '../../components/SignInForm';
import { SignUpForm } from '../../components/SignUpForm';
import { PizzaLists } from '../../components/PizzasList';

// eslint-disable-next-line
const client = init();

function Modal() {
    const [token, setToken] = useState<Token | null>(null);
    const [isOrderSummary, setIsOrderSummary] = useState(false);
    // eslint-disable-next-line
    const [user, setUser] = useState<User | null>(null);
    const [hasAccount, setHasAccount] = useState(false);
    const [hasPlacedOrder, setHasPlacedOrder] = useState(false);

    const onRegisterUser = (user: User) => {
        setUser(user);
        setHasAccount(true);
    };

    const onSignInUser = (data: Token) => {
        setToken(data);
    };

    const displayOrderSummary = () => setIsOrderSummary(!isOrderSummary);

    const onPlaceOrder = () => setHasPlacedOrder(!hasPlacedOrder);

    if (hasPlacedOrder && token) {
        return <OrderSuccess token={token} />;
    }

    if (isOrderSummary && token) {
        return <OrderSummary onPlaceOrder={onPlaceOrder} token={token} />;
    }

    if (token) {
        return <PizzaLists onSubmitOrder={displayOrderSummary} token={token} />;
    }

    return (
        <div className="sp-app-modal">
            <div className="sp-app-modal__navigation">
                <button
                    className="sp-app-modal__navigation-btn"
                    onClick={() => setHasAccount(true)}
                >
                    Sign In
                </button>
                <button
                    className="sp-app-modal__navigation-btn"
                    onClick={() => setHasAccount(false)}
                >
                    Sign Up
                </button>
            </div>
            {hasAccount ? (
                <SignInForm onSubmit={onSignInUser} />
            ) : (
                <SignUpForm onSubmit={onRegisterUser} />
            )}
        </div>
    );
}

export default function render() {
    ReactDOM.render(
        <React.StrictMode>
            <Modal />
        </React.StrictMode>,
        document.getElementById('root')
    );
}
